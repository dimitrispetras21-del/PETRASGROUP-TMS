-- 071 - NATIONAL v5, PHASE F1: THE SCHEMA, BORN CLOSED, 0 ROWS.
--
-- EXECUTED 22/10/2026 by the owner. Spec docs/superpowers/specs/2026-10-21-national-v5-design.md (owner 21/10), plan
-- docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md. The owner runs it in the Supabase SQL editor AFTER
-- 15:00 (the team works 05:30-14:30), with an explicit yes, in this order:
--   0. 071_plan_schema_fingerprint.sql   read-only: md5 of every round trip and payroll line (keep the row)
--   1. 071_plan_schema_dryrun.sql        this block + a deliberate error: NOTHING kept
--   2. 071_plan_schema.sql               (this file)
--   3. 071_plan_schema_verify.sql        read-only, one row
--   4. 071_plan_schema_fingerprint.sql   again: the same md5s as in step 0
--   5. 071_plan_schema_test.sql          OPTIONAL on production (it advances the RT-/PM- code sequences): the rules
--                                        on TEST rows, ends in a deliberate error, nothing kept
-- 071b (one truck / one driver at a time, btree_gist) is a SEPARATE yes: 071b_plan_one_vehicle*.sql.
-- No Worker change, no screen change: the new tables are not in the facade's TABLES map, so no screen sees them.
-- ASCII only (clipboard-safe). ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (nothing reads or writes it until F2 072 plan_*; every number of today stays the same):
--   1. locations.is_hub, exactly one: the Veroia cross-dock recJucKOhC1zh4IP3. Veroia stays a normal place
--      (spec 3, Board): it can be A or B of a national order; the flag says where pieces may split.
--   2. ct_round_trips: model (1 = today's round trips, 2 = a v5 cycle), start_at / end_at (written ONLY by the
--      base, from the cycle's live stops), partner_rate (one per cycle, PARTNER only). NO deleted_at: a cycle
--      that did not happen is status 'cancelled' (spec 2.1).
--   3. order_stops.via_hub: the hub declared per stop of an international order (spec 3, VS). Default false,
--      no backfill here: 074 sets it for the VS loads of day L.
--   4. shipments (one per A->B pair; a VS bridge copies NOTHING from its order_stops row), shipment_pieces
--      (split only at the hub), rt_stops (the stops of a cycle, a window per stop, side KATHODOS/ANODOS),
--      piece_legs (internal: which piece rides between which two stops of which cycle), plan_notices (the
--      notice channel of spec 7).
--   5. pl_movements.piece_leg_id + pl_mov_leg_once (one pallet writer per piece leg; F3 fills it).
--   6. local_moves: move_kind 'nat_loading' + rt_stop_id (the "loading by a local driver" of spec 3, Board).
--      Paid per day by the existing dl_local_day_sync, whose label names the cycle (RT-...) when the move has
--      no order.
--   7. Read views (security_invoker, money-free): v_shipments, v_piece_pos, v_piece_state, v_rt_stop_state,
--      v_rt_cycle, v_hub_bucket, v_national_order_state, v_vs_state. "Executed" = the Athens day of the stop's
--      planned_to has passed (spec 2.3), never a written status.
--   8. The rules, as low as they hold (principle 4): 9 triggers - ct_rt_legs_v2_guard (no order link on a v5
--      cycle), plan_rt_window_sync (a cycle's window = its live stops) and 7 DEFERRED constraint triggers
--      (checked at COMMIT) calling plan_chk(). A refusal: SQLSTATE 23514, HINT 'plan:<code>'.
--   9. Today's round-trip functions learn model=2, from their LIVE text (md5 read 21/10) + ONE line each:
--      rt_status_guard, rt_recompute, rt_auto_close return for model=2. The others (rt_sync_legs,
--      rt_sync_to_orders, rt_sync_to_national_loads, rt_create_from_order, rt_link_split, rt_merge,
--      rt_sync_from_order, rt_sync_national_load) reach a round trip only through ct_rt_legs, which
--      ct_rt_legs_v2_guard closes for model=2: unchanged. dl_sync_from_rt (011) unchanged on purpose: a v5
--      OWNED cycle with a driver gets its one payroll line exactly like today.
--  10. Born closed (principle 5): RLS on, no policy; every privilege revoked from PUBLIC, anon, authenticated,
--      service_role; SELECT only to service_role, tms_reader, tms_check_runner. EXECUTE on the 7 new functions
--      revoked from PUBLIC, anon, authenticated, service_role.
--  11. Auditor B-54 (enabled triggers in public): +9 in this block (37 -> 46 measured 21/10). The local mirror
--      (tms-auditor/checks/B-54.sql + 047b) is updated AFTER the run, not before.
--
-- PROOFS INSIDE THE BLOCK (any difference = everything undone): every round trip (vehicle, window, status,
-- revenue, every cost column, P&L) and every dl_entries row byte for byte before = after; local_moves,
-- order_stops and locations rows unchanged apart from the new columns; dl_v_rt_route / dl_v_rt_gap /
-- ct_v_rt_pnl counts unchanged; new tables 0 rows; model=2 0 rows; anon / authenticated hold nothing on the
-- new relations.
--
-- REVERSE: 071_plan_schema_rollback.sql (refuses if any v5 row exists).
-- EXPECTED: NOTICE "071 OK: ..." and ONE row "071 OK | 46 | 46 | <round trips before> | 0 | CROSS-DOCK".
-- Anything else (an ERROR): nothing was kept - copy the message to the coordinator.

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
  -- Every round trip with its money, as 034 fingerprinted it (034:149-164). New columns are not in it.
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
  -- Every payroll line whole; local moves, order stops and locations without the columns 071 adds.
  snap_rows_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e),
      (SELECT md5(coalesce(string_agg((to_jsonb(m) - 'rt_stop_id')::text, '|' ORDER BY m.id), '')) FROM public.local_moves m),
      (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'via_hub')::text, '|' ORDER BY s.id), '')) FROM public.order_stops s),
      (SELECT md5(coalesce(string_agg((to_jsonb(l) - 'is_hub')::text, '|' ORDER BY l.id), '')) FROM public.locations l),
      (SELECT count(*) FROM public.dl_v_rt_route), (SELECT count(*) FROM public.dl_v_rt_gap),
      (SELECT count(*) FROM public.ct_v_rt_pnl)) $q$;
  v_fn record; v_src text; v_new text;
  v_trg0 int; v_trg1 int; v_k int; v_hub bigint;
  v_rt0 text; v_rt1 text; v_rows0 text; v_rows1 text;
BEGIN
  -- ALTER TABLE on ct_round_trips / order_stops / locations / local_moves / pl_movements takes a strong lock:
  -- behind an idle open transaction it would wait forever while every app read queues behind it. Give up after
  -- 5 s instead - the whole block rolls back, nothing half-done; run it again a little later (as 057/060/069).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only): the base is what was measured 21/10.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '071: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regclass('public.shipments') IS NOT NULL OR to_regclass('public.rt_stops') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'ct_round_trips' AND column_name = 'model') THEN
    RAISE EXCEPTION '071: already applied (a 071 object exists) - run 071_plan_schema_verify.sql instead';
  END IF;
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', 'f632fea1d6a5dd2cee7c80f4db9e27f2'),
      ('public.rt_recompute(bigint)', '3f85092f030b2ad92a3002ab0a9cc98d'),
      ('public.rt_auto_close(bigint)', '88b41f860aaf7f925183ab84dc10c2dd'),
      ('public.dl_local_day_sync(bigint,date)', 'a4a62603e5b0c4ad48124fea625aa611')) v(sig, m) LOOP
    IF to_regprocedure(v_fn.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) IS DISTINCT FROM v_fn.m THEN
      RAISE EXCEPTION '071: % is not the live text read 21/10 (expected md5 %) - stop, re-measure', v_fn.sig, v_fn.m;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn.sig)
                AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']
                     OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql'))) THEN
      RAISE EXCEPTION '071: % is not plpgsql SECURITY DEFINER SET search_path = public as read 21/10 - stop', v_fn.sig;
    END IF;
  END LOOP;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_chk')
       IS DISTINCT FROM 'CHECK ((move_kind = ANY (ARRAY[''local''::text, ''relay_delivery''::text, ''relay_loading''::text])))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_parent')
       IS DISTINCT FROM 'CHECK ((((move_kind = ''local''::text) AND (parent_order_id IS NULL)) OR ((move_kind <> ''local''::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_relay_trailer')
       IS DISTINCT FROM 'CHECK (((move_kind = ''local''::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL)))' THEN
    RAISE EXCEPTION '071: a local_moves CHECK is not the 060 text read 21/10 - stop';
  END IF;
  -- The columns the views read and F2 plan_orders_create fills (spec 7): present, with these types.
  SELECT count(*) INTO v_k FROM (VALUES
      ('national_orders', 'client_id', 'bigint'), ('national_orders', 'price', 'numeric'),
      ('national_orders', 'reference', 'text'), ('national_orders', 'pallets', 'numeric'),
      ('national_orders', 'temperature_c', 'numeric'), ('national_orders', 'goods', 'text'),
      ('national_orders', 'notes', 'text'), ('national_orders', 'loading_datetime', 'date'),
      ('national_orders', 'delivery_datetime', 'date'), ('national_orders', 'pickup_location_1_id', 'bigint'),
      ('national_orders', 'delivery_location_1_id', 'bigint'), ('national_orders', 'pallet_exchange', 'boolean'),
      ('national_orders', 'deleted_at', 'timestamp with time zone'),
      ('orders', 'direction', 'text'), ('orders', 'cross_dock_date', 'date'), ('orders', 'client_id', 'bigint'),
      ('orders', 'reference', 'text'), ('orders', 'temperature_c', 'numeric'), ('orders', 'pallet_exchange', 'boolean'),
      ('orders', 'deleted_at', 'timestamp with time zone'),
      ('order_stops', 'stop_type', 'text'), ('order_stops', 'stop_number', 'numeric'),
      ('order_stops', 'location_id', 'bigint'), ('order_stops', 'pallets', 'numeric'),
      ('order_stops', 'datetime', 'date'), ('order_stops', 'temperature', 'numeric'),
      ('order_stops', 'deleted_at', 'timestamp with time zone')) v(t, c, ty)
   JOIN information_schema.columns ic
     ON ic.table_schema = 'public' AND ic.table_name = v.t AND ic.column_name = v.c AND ic.data_type = v.ty;
  IF v_k <> 27 THEN
    RAISE EXCEPTION '071: a column the views or F2 rely on is missing or has another type (% of 27) - stop', v_k;
  END IF;
  SELECT count(*) INTO v_k FROM public.locations WHERE legacy_id = 'recJucKOhC1zh4IP3' AND deleted_at IS NULL;
  IF v_k <> 1 THEN
    RAISE EXCEPTION '071: the Veroia cross-dock location (recJucKOhC1zh4IP3) is not exactly one live row (%)', v_k;
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- run_checks compares against coalesce(baseline, red_value): a baseline would make the bump below a no-op.
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '071: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', v_trg0;
  END IF;
  EXECUTE snap_rt_sql INTO v_rt0;
  EXECUTE snap_rows_sql INTO v_rows0;

  -- 1. The hub.
  ALTER TABLE public.locations ADD COLUMN is_hub boolean NOT NULL DEFAULT false;
  CREATE UNIQUE INDEX locations_one_hub ON public.locations (is_hub) WHERE is_hub;
  UPDATE public.locations SET is_hub = true
   WHERE legacy_id = 'recJucKOhC1zh4IP3' AND deleted_at IS NULL RETURNING id INTO v_hub;

  -- 2. The cycle. Existing rows take model 1 from the DEFAULT (no rewrite, PG >= 11).
  ALTER TABLE public.ct_round_trips
    ADD COLUMN model smallint NOT NULL DEFAULT 1,
    ADD COLUMN start_at timestamptz,
    ADD COLUMN end_at timestamptz,
    ADD COLUMN partner_rate numeric(10,2),
    ADD CONSTRAINT rt_model CHECK (model IN (1, 2)),
    ADD CONSTRAINT rt_v2_scope CHECK (model = 1 OR scope = 'NATL'),
    ADD CONSTRAINT rt_v2_status CHECK (model = 1 OR status IN ('planned', 'cancelled')),
    ADD CONSTRAINT rt_v2_window CHECK (model = 1 OR (start_at IS NOT NULL AND end_at > start_at)),
    ADD CONSTRAINT rt_v1_no_window CHECK (model = 2 OR (start_at IS NULL AND end_at IS NULL)),
    ADD CONSTRAINT rt_v2_dates CHECK (model = 1 OR (date_start = (start_at AT TIME ZONE 'Europe/Athens')::date
                                                    AND date_end = (end_at AT TIME ZONE 'Europe/Athens')::date)),
    ADD CONSTRAINT rt_partner_rate CHECK (partner_rate IS NULL
                                          OR (model = 2 AND trip_type = 'PARTNER' AND partner_rate >= 0));

  -- 3. The hub per stop of an international order.
  ALTER TABLE public.order_stops
    ADD COLUMN via_hub boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT order_stops_via_hub_intl CHECK (NOT via_hub OR order_id IS NOT NULL);

  -- 4. The new tables.
  CREATE TABLE public.shipments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint REFERENCES public.orders (id) ON DELETE RESTRICT,
    nat_order_id bigint REFERENCES public.national_orders (id) ON DELETE RESTRICT,
    order_stop_id bigint REFERENCES public.order_stops (id) ON DELETE RESTRICT,
    origin_location_id bigint REFERENCES public.locations (id) ON DELETE RESTRICT,
    dest_location_id bigint REFERENCES public.locations (id) ON DELETE RESTRICT,
    pallets numeric(6,1),
    load_from timestamptz, load_to timestamptz, deliver_from timestamptz, deliver_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    CONSTRAINT shipments_one_parent CHECK (num_nonnulls(order_id, nat_order_id) = 1),
    CONSTRAINT shipments_bridge_intl CHECK (order_stop_id IS NULL OR order_id IS NOT NULL),
    -- v5 first version: an international order enters only as a VS bridge (export groupage postponed, spec 3).
    CONSTRAINT shipments_intl_is_bridge CHECK (order_id IS NULL OR order_stop_id IS NOT NULL),
    -- A bridge copies NOTHING (places, pallets, days are read from order_stops / orders via v_shipments);
    -- a national shipment carries all of them (owner #12: a window from-to everywhere).
    CONSTRAINT shipments_shape CHECK (
      (order_stop_id IS NOT NULL AND origin_location_id IS NULL AND dest_location_id IS NULL AND pallets IS NULL
        AND load_from IS NULL AND load_to IS NULL AND deliver_from IS NULL AND deliver_to IS NULL)
      OR (order_stop_id IS NULL AND origin_location_id IS NOT NULL AND dest_location_id IS NOT NULL
        AND pallets IS NOT NULL AND load_from IS NOT NULL AND load_to IS NOT NULL
        AND deliver_from IS NOT NULL AND deliver_to IS NOT NULL)),
    CONSTRAINT shipments_pallets CHECK (pallets IS NULL OR pallets > 0),
    CONSTRAINT shipments_win CHECK (load_from IS NULL
      OR (load_from <= load_to AND deliver_from <= deliver_to AND load_from <= deliver_to)),
    CONSTRAINT shipments_ends CHECK (order_stop_id IS NOT NULL OR origin_location_id <> dest_location_id),
    CONSTRAINT shipments_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                    AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE UNIQUE INDEX shipments_bridge_once ON public.shipments (order_stop_id)
    WHERE order_stop_id IS NOT NULL AND deleted_at IS NULL;
  CREATE INDEX shipments_order ON public.shipments (order_id) WHERE order_id IS NOT NULL;
  CREATE INDEX shipments_nat_order ON public.shipments (nat_order_id) WHERE nat_order_id IS NOT NULL;

  CREATE TABLE public.shipment_pieces (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id bigint NOT NULL REFERENCES public.shipments (id) ON DELETE RESTRICT,
    parent_piece_id bigint REFERENCES public.shipment_pieces (id) ON DELETE RESTRICT,
    pallets numeric(6,1) NOT NULL,
    leave_by date,
    split_at timestamptz, split_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    CONSTRAINT pieces_pallets CHECK (pallets > 0),
    CONSTRAINT pieces_split_pair CHECK ((split_at IS NULL) = (split_by IS NULL)),
    CONSTRAINT pieces_not_own_parent CHECK (parent_piece_id IS DISTINCT FROM id),
    CONSTRAINT pieces_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                 AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE INDEX shipment_pieces_shipment ON public.shipment_pieces (shipment_id);
  CREATE INDEX shipment_pieces_parent ON public.shipment_pieces (parent_piece_id) WHERE parent_piece_id IS NOT NULL;

  CREATE TABLE public.rt_stops (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rt_id bigint NOT NULL,
    seq smallint NOT NULL,
    location_id bigint NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    side text NOT NULL,
    planned_from timestamptz NOT NULL,
    planned_to timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    -- DEFERRED: plan_rt_create writes the stops FIRST and the cycle with its computed window after them, in one
    -- transaction (spec 7), so CHECK rt_v2_window and the payroll day of 011 hold from the first row.
    CONSTRAINT rt_stops_rt_fk FOREIGN KEY (rt_id) REFERENCES public.ct_round_trips (id)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT rt_stops_rt_id UNIQUE (rt_id, id),
    CONSTRAINT rt_stops_seq CHECK (seq > 0),
    CONSTRAINT rt_stops_side CHECK (side IN ('KATHODOS', 'ANODOS')),
    -- A stop is a window from-to, never one instant (owner #12): with planned_to = planned_from a cycle whose live
    -- stops collapse to one instant would break rt_v2_window (end_at > start_at) inside plan_rt_window_sync.
    CONSTRAINT rt_stops_win CHECK (planned_to > planned_from),
    CONSTRAINT rt_stops_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                   AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );

  CREATE TABLE public.piece_legs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    piece_id bigint NOT NULL REFERENCES public.shipment_pieces (id) ON DELETE RESTRICT,
    leg_no smallint NOT NULL,
    rt_id bigint NOT NULL,
    pickup_stop_id bigint NOT NULL,
    drop_stop_id bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    -- Both stops belong to the leg's own cycle: a composite key, not a trigger.
    CONSTRAINT piece_legs_pickup_fk FOREIGN KEY (rt_id, pickup_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
    CONSTRAINT piece_legs_drop_fk FOREIGN KEY (rt_id, drop_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
    CONSTRAINT piece_legs_no CHECK (leg_no > 0),
    CONSTRAINT piece_legs_two_stops CHECK (pickup_stop_id <> drop_stop_id),
    CONSTRAINT piece_legs_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                     AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE UNIQUE INDEX piece_legs_live_no ON public.piece_legs (piece_id, leg_no) WHERE deleted_at IS NULL;
  CREATE INDEX piece_legs_rt ON public.piece_legs (rt_id);
  CREATE INDEX piece_legs_pickup ON public.piece_legs (pickup_stop_id);
  CREATE INDEX piece_legs_drop ON public.piece_legs (drop_stop_id);

  CREATE TABLE public.plan_notices (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    to_desk text NOT NULL,
    kind text NOT NULL,
    message text NOT NULL,
    order_id bigint REFERENCES public.orders (id) ON DELETE RESTRICT,
    nat_order_id bigint REFERENCES public.national_orders (id) ON DELETE RESTRICT,
    rt_id bigint REFERENCES public.ct_round_trips (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    read_at timestamptz, read_by text,
    CONSTRAINT plan_notices_desk CHECK (to_desk IN ('intl', 'natl')),
    CONSTRAINT plan_notices_kind CHECK (kind ~ '^[a-z_]+$'),
    CONSTRAINT plan_notices_read_pair CHECK ((read_at IS NULL) = (read_by IS NULL))
  );
  CREATE INDEX plan_notices_unread ON public.plan_notices (to_desk, created_at) WHERE read_at IS NULL;

  -- 5. Pallets (F3 writes it) and the loading by a local driver.
  ALTER TABLE public.pl_movements ADD COLUMN piece_leg_id bigint REFERENCES public.piece_legs (id) ON DELETE RESTRICT;
  CREATE UNIQUE INDEX pl_mov_leg_once ON public.pl_movements (piece_leg_id, event_type)
    WHERE piece_leg_id IS NOT NULL AND status <> 'reversed';
  ALTER TABLE public.local_moves ADD COLUMN rt_stop_id bigint REFERENCES public.rt_stops (id) ON DELETE RESTRICT;
  -- Same meaning for every existing row (the only kinds today are local / relay_*); nat_loading added. A
  -- nat_loading needs no trailer (spec 3: no mandatory question; plan_local_loading may ask for one in F2).
  ALTER TABLE public.local_moves
    DROP CONSTRAINT local_moves_kind_chk,
    DROP CONSTRAINT local_moves_kind_parent,
    DROP CONSTRAINT local_moves_relay_trailer,
    ADD CONSTRAINT local_moves_kind_chk CHECK (move_kind IN ('local', 'relay_delivery', 'relay_loading', 'nat_loading')),
    ADD CONSTRAINT local_moves_kind_parent CHECK (
      (move_kind = 'local' AND parent_order_id IS NULL)
      OR (move_kind IN ('relay_delivery', 'relay_loading') AND parent_order_id IS NOT NULL AND parent_nat_load_id IS NULL)
      OR (move_kind = 'nat_loading' AND parent_order_id IS NULL AND parent_nat_load_id IS NULL)),
    ADD CONSTRAINT local_moves_relay_trailer CHECK (move_kind IN ('local', 'nat_loading') OR driver_id IS NULL OR trailer_id IS NOT NULL),
    ADD CONSTRAINT local_moves_nat_loading CHECK (
      (move_kind = 'nat_loading') = (rt_stop_id IS NOT NULL)
      AND (move_kind <> 'nat_loading' OR (driver_id IS NOT NULL AND status IN ('Assigned', 'Cancelled'))));
  CREATE UNIQUE INDEX local_moves_nat_loading_once ON public.local_moves (rt_stop_id)
    WHERE move_kind = 'nat_loading' AND deleted_at IS NULL AND status <> 'Cancelled';

  -- 6. The read views. ONE definition of "where is a piece" (v_piece_pos) and of "executed" (Athens day of
  -- planned_to passed, spec 2.3); the triggers below read the same views, never a second copy.
  CREATE VIEW public.v_shipments WITH (security_invoker = true) AS
  SELECT sh.id AS shipment_id,
         CASE WHEN sh.order_stop_id IS NULL THEN 'national'
              WHEN o.direction = 'Import' THEN 'vs_import' ELSE 'vs_export' END AS kind,
         sh.order_id, sh.nat_order_id, sh.order_stop_id,
         coalesce(n.client_id, o.client_id) AS client_id,
         coalesce(n.reference, o.reference) AS reference,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.origin_location_id
              WHEN o.direction = 'Import' THEN (SELECT f.location_id FROM public.order_stops f
                     WHERE f.order_id = sh.order_id AND f.stop_type = 'Loading' AND f.deleted_at IS NULL
                     ORDER BY f.stop_number NULLS LAST, f.id LIMIT 1)
              ELSE st.location_id END AS origin_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.dest_location_id
              WHEN o.direction = 'Import' THEN st.location_id
              ELSE (SELECT f.location_id FROM public.order_stops f
                     WHERE f.order_id = sh.order_id AND f.stop_type = 'Unloading' AND f.deleted_at IS NULL
                     ORDER BY f.stop_number DESC NULLS LAST, f.id DESC LIMIT 1) END AS dest_location_id,
         -- the national part: import VS = hub -> Greek stop; export VS = Greek stop -> hub
         CASE WHEN sh.order_stop_id IS NULL THEN sh.origin_location_id
              WHEN o.direction = 'Import' THEN hub.id ELSE st.location_id END AS nat_from_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.dest_location_id
              WHEN o.direction = 'Import' THEN st.location_id ELSE hub.id END AS nat_to_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.pallets ELSE st.pallets END AS pallets,
         CASE WHEN sh.order_stop_id IS NULL THEN (sh.load_from AT TIME ZONE 'Europe/Athens')::date
              WHEN o.direction = 'Import' THEN o.cross_dock_date ELSE st.datetime END AS nat_ready_day,
         CASE WHEN sh.order_stop_id IS NULL THEN (sh.deliver_to AT TIME ZONE 'Europe/Athens')::date
              WHEN o.direction = 'Import' THEN st.datetime ELSE o.cross_dock_date END AS nat_due_day,
         sh.load_from, sh.load_to, sh.deliver_from, sh.deliver_to,
         CASE WHEN sh.order_stop_id IS NULL THEN n.temperature_c ELSE coalesce(st.temperature, o.temperature_c) END AS temperature_c,
         coalesce(CASE WHEN sh.order_stop_id IS NULL THEN n.pallet_exchange ELSE o.pallet_exchange END, false) AS pallet_exchange,
         (sh.deleted_at IS NULL AND n.deleted_at IS NULL AND o.deleted_at IS NULL
          AND (sh.order_stop_id IS NULL OR st.deleted_at IS NULL)) AS live,
         sh.created_at, sh.created_by, sh.deleted_at
  FROM public.shipments sh
  LEFT JOIN public.orders o ON o.id = sh.order_id
  LEFT JOIN public.national_orders n ON n.id = sh.nat_order_id
  LEFT JOIN public.order_stops st ON st.id = sh.order_stop_id
  LEFT JOIN public.locations hub ON hub.is_hub;

  CREATE VIEW public.v_piece_pos WITH (security_invoker = true) AS
  WITH RECURSIVE own AS (
    SELECT p.id AS piece_id, p.parent_piece_id, p.shipment_id, p.pallets, p.leave_by,
           (SELECT l.id FROM public.piece_legs l WHERE l.piece_id = p.id AND l.deleted_at IS NULL
             ORDER BY l.leg_no DESC LIMIT 1) AS own_last_leg_id,
           EXISTS (SELECT 1 FROM public.shipment_pieces c WHERE c.parent_piece_id = p.id AND c.deleted_at IS NULL) AS is_split
    FROM public.shipment_pieces p WHERE p.deleted_at IS NULL
  ), walk AS (
    -- a child piece without legs of its own sits where its parent's last leg left it (the hub)
    SELECT o.piece_id, o.parent_piece_id, o.shipment_id, o.pallets, o.leave_by, o.own_last_leg_id, o.is_split,
           o.own_last_leg_id AS eff_last_leg_id
    FROM own o WHERE o.parent_piece_id IS NULL
    UNION ALL
    SELECT c.piece_id, c.parent_piece_id, c.shipment_id, c.pallets, c.leave_by, c.own_last_leg_id, c.is_split,
           coalesce(c.own_last_leg_id, w.eff_last_leg_id)
    FROM own c JOIN walk w ON w.piece_id = c.parent_piece_id
  )
  SELECT w.piece_id, w.parent_piece_id, w.shipment_id, w.pallets, w.leave_by, w.is_split,
         w.own_last_leg_id, w.eff_last_leg_id, ll.drop_stop_id AS last_drop_stop_id,
         coalesce(ds.location_id, vs.nat_from_location_id) AS position_location_id
  FROM walk w
  JOIN public.v_shipments vs ON vs.shipment_id = w.shipment_id
  LEFT JOIN public.piece_legs ll ON ll.id = w.eff_last_leg_id
  LEFT JOIN public.rt_stops ds ON ds.id = ll.drop_stop_id;

  CREATE VIEW public.v_piece_state WITH (security_invoker = true) AS
  SELECT pp.piece_id, pp.shipment_id, vs.kind, vs.order_id, vs.nat_order_id, vs.order_stop_id,
         pp.parent_piece_id, pp.pallets, pp.leave_by, pp.position_location_id, pp.last_drop_stop_id,
         (pp.position_location_id = hub.id) IS TRUE AS at_hub,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id) AS waiting,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN pp.last_drop_stop_id END AS end_stop_id,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN es.planned_to END AS national_end_at,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id
              THEN (es.planned_to AT TIME ZONE 'Europe/Athens')::date END AS end_day,
         vs.nat_ready_day, vs.nat_due_day,
         -- spec 2.3: executed = the Athens day of the end stop's planned_to has passed; a cancelled cycle never is
         (pp.position_location_id = vs.nat_to_location_id AND er.status <> 'cancelled'
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS executed,
         -- spec 2.3: late = the planned delivery day is after the requested day
         (pp.position_location_id = vs.nat_to_location_id
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date > vs.nat_due_day) IS TRUE AS late,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id
          AND coalesce(pp.leave_by, vs.nat_due_day) < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS overdue,
         (pp.parent_piece_id IS NOT NULL AND pp.own_last_leg_id IS NULL) AS is_stock
  FROM public.v_piece_pos pp
  JOIN public.v_shipments vs ON vs.shipment_id = pp.shipment_id AND vs.live
  LEFT JOIN public.locations hub ON hub.is_hub
  LEFT JOIN public.rt_stops es ON es.id = pp.last_drop_stop_id
  LEFT JOIN public.ct_round_trips er ON er.id = es.rt_id
  WHERE NOT pp.is_split;

  CREATE VIEW public.v_rt_stop_state WITH (security_invoker = true) AS
  WITH st AS (
    SELECT s.id AS stop_id, s.rt_id, r.code, s.seq, s.side, s.location_id, s.planned_from, s.planned_to,
           (s.planned_to AT TIME ZONE 'Europe/Athens')::date AS stop_day,
           (r.status <> 'cancelled'
            AND (s.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) AS executed,
           CASE r.trip_type WHEN 'OWNED' THEN r.truck_id IS NOT NULL ELSE r.partner_id IS NOT NULL END AS has_vehicle,
           EXISTS (SELECT 1 FROM public.v_piece_state ps WHERE ps.end_stop_id = s.id AND ps.late) AS has_late,
           r.status AS rt_status
    FROM public.rt_stops s JOIN public.ct_round_trips r ON r.id = s.rt_id
    WHERE s.deleted_at IS NULL AND r.model = 2
  )
  -- spec 3, Board: what is executed dims (40%), per day; never without a vehicle, never when late
  SELECT st.*, (st.executed AND st.has_vehicle AND NOT st.has_late) AS dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id, st.side) AS side_dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id) AS cycle_dim
  FROM st;

  CREATE VIEW public.v_rt_cycle WITH (security_invoker = true) AS
  SELECT r.id AS rt_id, r.code, r.status, r.trip_type, r.truck_id, r.trailer_id, r.driver_id, r.partner_id,
         r.start_at, r.end_at, r.date_start, r.date_end,
         (SELECT count(*) FROM public.rt_stops s WHERE s.rt_id = r.id AND s.deleted_at IS NULL) AS n_stops,
         (SELECT count(*) FROM public.piece_legs l WHERE l.rt_id = r.id AND l.deleted_at IS NULL) AS n_legs,
         -- spec 2.3: the end of a cycle = the day of its last stop has passed (the same rule /costs/rt will use)
         (r.status <> 'cancelled'
          AND (r.end_at AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) AS ended
  FROM public.ct_round_trips r WHERE r.model = 2;

  CREATE VIEW public.v_hub_bucket WITH (security_invoker = true) AS
  SELECT ps.piece_id, ps.shipment_id, ps.kind, ps.order_id, ps.nat_order_id, ps.order_stop_id, ps.pallets,
         ps.is_stock, ps.leave_by, ps.overdue, ps.nat_ready_day, ps.nat_due_day, ds.rt_id AS inbound_rt_id
  FROM public.v_piece_state ps
  LEFT JOIN public.rt_stops ds ON ds.id = ps.last_drop_stop_id
  WHERE ps.at_hub AND ps.waiting;

  CREATE VIEW public.v_national_order_state WITH (security_invoker = true) AS
  SELECT ps.nat_order_id, count(*) AS n_pieces, count(*) FILTER (WHERE ps.executed) AS n_executed,
         -- spec 2.3: a national order is delivered only when EVERY piece has an executed delivery stop
         bool_and(ps.executed) AS executed, bool_and(NOT ps.waiting) AS planned, bool_or(ps.late) AS late
  FROM public.v_piece_state ps WHERE ps.nat_order_id IS NOT NULL
  GROUP BY ps.nat_order_id;

  CREATE VIEW public.v_vs_state WITH (security_invoker = true) AS
  SELECT ps.order_id,
         count(DISTINCT ps.piece_id) AS n_pieces,
         bool_and(ps.executed) AS all_executed,
         bool_and(NOT ps.waiting) AS all_planned,
         -- spec 3, VS: the international shows the FIRST hub day, the others as a hint
         min(CASE WHEN ps.kind = 'vs_import' THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                  ELSE (dr.planned_to AT TIME ZONE 'Europe/Athens')::date END) AS first_hub_day,
         coalesce(jsonb_agg(DISTINCT jsonb_build_object('rt_id', r.id, 'code', r.code, 'trip_type', r.trip_type,
                    'truck_id', r.truck_id, 'driver_id', r.driver_id, 'partner_id', r.partner_id,
                    'hub_day', CASE WHEN ps.kind = 'vs_import' THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                                    ELSE (dr.planned_to AT TIME ZONE 'Europe/Athens')::date END))
                  FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS carriers
  FROM public.v_piece_state ps
  LEFT JOIN public.piece_legs l ON l.piece_id = ps.piece_id AND l.deleted_at IS NULL
  LEFT JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
  LEFT JOIN public.rt_stops dr ON dr.id = l.drop_stop_id
  LEFT JOIN public.ct_round_trips r ON r.id = l.rt_id
  WHERE ps.kind IN ('vs_import', 'vs_export')
  GROUP BY ps.order_id;

  -- 7. The rules. Each *_problem returns NULL or '<code>:<detail>'; plan_chk raises it with HINT 'plan:<code>'.
  CREATE FUNCTION public.plan_local_loading_problem(p_lm bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  lm local_moves%rowtype; s rt_stops%rowtype; r ct_round_trips%rowtype;
begin
  select * into lm from local_moves where id = p_lm;
  if lm.id is null or lm.move_kind <> 'nat_loading' or lm.deleted_at is not null or lm.status = 'Cancelled' then
    return null;
  end if;
  select * into s from rt_stops where id = lm.rt_stop_id;
  select * into r from ct_round_trips where id = s.rt_id;
  -- spec 3, Board: when the stop goes (clear, move, delete) the local loading goes with it, in the same list
  if s.deleted_at is not null or r.status = 'cancelled' then return 'local_loading_gone:' || p_lm; end if;
  -- the payroll day (dl_local_day_sync) is the Athens day the loading starts
  if lm.move_date <> (s.planned_from at time zone 'Europe/Athens')::date then return 'local_loading_day:' || p_lm; end if;
  if not exists (select 1 from piece_legs l where l.pickup_stop_id = s.id and l.deleted_at is null) then
    return 'local_loading_stop:' || p_lm;
  end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_rt_problem(p_rt bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  r ct_round_trips%rowtype; s_min timestamptz; s_max timestamptz; x bigint; prob text;
begin
  select * into r from ct_round_trips where id = p_rt;
  if r.id is null then return null; end if;  -- the deferred FK rt_stops_rt_fk speaks for a missing cycle
  if r.model <> 2 then
    if exists (select 1 from rt_stops where rt_id = p_rt) then return 'rt_not_v2:' || p_rt; end if;
    return null;
  end if;
  -- seq is unique among LIVE stops: a trigger, not a UNIQUE, because a partial unique index cannot be deferred
  if exists (select 1 from rt_stops where rt_id = p_rt and deleted_at is null group by seq having count(*) > 1) then
    return 'stop_seq:' || p_rt;
  end if;
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null and b.planned_from < a.planned_from) then
    return 'stop_order:' || p_rt;
  end if;
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null
                and a.side = 'ANODOS' and b.side = 'KATHODOS') then
    return 'side_order:' || p_rt;
  end if;
  select min(planned_from), max(planned_to) into s_min, s_max from rt_stops where rt_id = p_rt and deleted_at is null;
  if s_min is not null and (r.start_at, r.end_at) is distinct from (s_min, s_max) then return 'rt_window:' || p_rt; end if;
  if r.status = 'cancelled' and exists (select 1 from piece_legs where rt_id = p_rt and deleted_at is null) then
    return 'rt_cancelled:' || p_rt;
  end if;
  for x in select lm.id from local_moves lm join rt_stops s on s.id = lm.rt_stop_id
            where s.rt_id = p_rt and lm.move_kind = 'nat_loading' and lm.deleted_at is null and lm.status <> 'Cancelled' loop
    prob := plan_local_loading_problem(x);
    if prob is not null then return prob; end if;
  end loop;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_leg_problem(p_leg bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  l piece_legs%rowtype; pk rt_stops%rowtype; dr rt_stops%rowtype; prev rt_stops%rowtype;
  r ct_round_trips%rowtype; p shipment_pieces%rowtype; vs v_shipments%rowtype;
  hub_id bigint; start_loc bigint;
begin
  select * into l from piece_legs where id = p_leg;
  if l.id is null or l.deleted_at is not null then return null; end if;
  select * into r from ct_round_trips where id = l.rt_id;
  if r.model is distinct from 2 then return 'rt_not_v2:' || l.rt_id; end if;
  if r.status = 'cancelled' then return 'rt_cancelled:' || l.rt_id; end if;
  select * into pk from rt_stops where id = l.pickup_stop_id;
  select * into dr from rt_stops where id = l.drop_stop_id;
  if pk.deleted_at is not null or dr.deleted_at is not null then return 'leg_stop_dead:' || p_leg; end if;
  if pk.seq >= dr.seq then return 'leg_order:' || p_leg; end if;
  select * into p from shipment_pieces where id = l.piece_id;
  select * into vs from v_shipments where shipment_id = p.shipment_id;
  if p.deleted_at is not null or not vs.live then return 'piece_dead:' || p.id; end if;
  -- a piece rides only between its national start, the hub and its national end (it splits only at the hub)
  select id into hub_id from locations where is_hub;
  if pk.location_id = dr.location_id
     or (pk.location_id is distinct from vs.nat_from_location_id and pk.location_id is distinct from hub_id)
     or (dr.location_id is distinct from vs.nat_to_location_id and dr.location_id is distinct from hub_id) then
    return 'leg_place:' || p_leg;
  end if;
  -- the chain: leg n loads where the previous live leg unloaded; a child piece where its parent sits; else at its start
  select s.* into prev from piece_legs q join rt_stops s on s.id = q.drop_stop_id
   where q.piece_id = l.piece_id and q.deleted_at is null and q.leg_no < l.leg_no
   order by q.leg_no desc limit 1;
  if prev.id is not null then
    start_loc := prev.location_id;
  elsif p.parent_piece_id is not null then
    select s.* into prev from v_piece_pos pp join rt_stops s on s.id = pp.last_drop_stop_id where pp.piece_id = p.parent_piece_id;
    select pp.position_location_id into start_loc from v_piece_pos pp where pp.piece_id = p.parent_piece_id;
  else
    start_loc := vs.nat_from_location_id;
  end if;
  if pk.location_id is distinct from start_loc then return 'chain:' || p_leg; end if;
  -- it cannot be picked up before it can have arrived
  if prev.id is not null and pk.planned_from < prev.planned_from then return 'chain_time:' || p_leg; end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_shipment_problem(p_sh bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  sh shipments%rowtype; target numeric; leaves numeric; bad bigint; hub_id bigint; prob text;
begin
  select * into sh from shipments where id = p_sh;
  if sh.id is null then return null; end if;
  -- a live leg never hangs on a deleted piece
  select l.id into bad from piece_legs l join shipment_pieces p on p.id = l.piece_id
   where p.shipment_id = p_sh and l.deleted_at is null and p.deleted_at is not null limit 1;
  if bad is not null then return 'piece_dead:' || bad; end if;
  -- a deleted shipment keeps nothing alive under it
  if sh.deleted_at is not null then
    select p.id into bad from shipment_pieces p where p.shipment_id = p_sh and p.deleted_at is null limit 1;
    if bad is not null then return 'pieces_alive:' || bad; end if;
    return null;
  end if;
  -- the live leaves sum to the shipment (a bridge: to its order stop; a deleted stop: to 0)
  target := case when sh.order_stop_id is null then sh.pallets
                 else (select st.pallets from order_stops st where st.id = sh.order_stop_id and st.deleted_at is null) end;
  select coalesce(sum(p.pallets), 0) into leaves from shipment_pieces p
   where p.shipment_id = p_sh and p.deleted_at is null
     and not exists (select 1 from shipment_pieces c where c.parent_piece_id = p.id and c.deleted_at is null);
  if leaves <> coalesce(target, 0) then
    return format('pieces_sum:%s:%s<>%s', p_sh, leaves, coalesce(target, 0));
  end if;
  select p.id into bad from shipment_pieces p join shipment_pieces q on q.id = p.parent_piece_id
   where p.shipment_id = p_sh and p.deleted_at is null and (q.deleted_at is not null or q.shipment_id <> p.shipment_id)
   limit 1;
  if bad is not null then return 'piece_parent:' || bad; end if;
  -- spec 3, Board: a load splits only at Veroia
  select id into hub_id from locations where is_hub;
  select pp.piece_id into bad from v_piece_pos pp
   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id limit 1;
  if bad is not null then return 'split_not_at_hub:' || bad; end if;
  for bad in select l.id from piece_legs l join shipment_pieces p on p.id = l.piece_id
              where p.shipment_id = p_sh and l.deleted_at is null order by l.piece_id, l.leg_no loop
    prob := plan_leg_problem(bad);
    if prob is not null then return prob; end if;
  end loop;
  return null;
end
$f$;

  -- One trigger function for the 7 deferred checks: SECURITY DEFINER, so the check does not depend on the
  -- privileges of whoever commits (the Worker's service_role reads none of the helpers).
  CREATE FUNCTION public.plan_chk() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  prob text; x bigint;
begin
  -- Every change leaves its trace (spec 2.2): the four plan tables are soft-deleted only. A hard DELETE would skip
  -- every rule below (chain, pieces_sum, the local loading), so it is refused at COMMIT like any broken rule.
  if tg_op = 'DELETE' then
    raise exception 'plan rule broken: hard delete on % (soft delete only)', tg_table_name
      using errcode = '23514', hint = 'plan:hard_delete';
  end if;
  if tg_table_name = 'ct_round_trips' then
    if tg_op = 'UPDATE' and old.model is distinct from new.model then
      prob := 'model_locked:' || new.id;
    elsif new.model = 2 then
      prob := plan_rt_problem(new.id);
    end if;
  elsif tg_table_name = 'rt_stops' then
    if tg_op = 'UPDATE' and old.rt_id is distinct from new.rt_id then
      prob := 'stop_locked:' || new.id;
    else
      prob := plan_rt_problem(new.rt_id);
      if prob is null then
        for x in select distinct p.shipment_id from piece_legs l join shipment_pieces p on p.id = l.piece_id
                  where l.pickup_stop_id = new.id or l.drop_stop_id = new.id loop
          prob := plan_shipment_problem(x);
          exit when prob is not null;
        end loop;
      end if;
    end if;
  elsif tg_table_name = 'piece_legs' then
    -- a leg never changes: soft delete it and add a new one (every change leaves its trace)
    if tg_op = 'UPDATE' and (old.piece_id, old.leg_no, old.rt_id, old.pickup_stop_id, old.drop_stop_id)
                            is distinct from (new.piece_id, new.leg_no, new.rt_id, new.pickup_stop_id, new.drop_stop_id) then
      prob := 'leg_locked:' || new.id;
    else
      prob := coalesce(plan_shipment_problem((select p.shipment_id from shipment_pieces p where p.id = new.piece_id)),
                       plan_rt_problem(new.rt_id));
    end if;
  elsif tg_table_name = 'shipment_pieces' then
    if tg_op = 'UPDATE' and (old.shipment_id, old.parent_piece_id) is distinct from (new.shipment_id, new.parent_piece_id) then
      prob := 'piece_locked:' || new.id;
    else
      prob := plan_shipment_problem(new.shipment_id);
    end if;
  elsif tg_table_name = 'shipments' then
    if tg_op = 'UPDATE' and (old.order_id, old.nat_order_id, old.order_stop_id)
                            is distinct from (new.order_id, new.nat_order_id, new.order_stop_id) then
      prob := 'shipment_locked:' || new.id;
    else
      prob := plan_shipment_problem(new.id);
    end if;
  elsif tg_table_name = 'order_stops' then
    for x in select s.id from shipments s where s.order_stop_id = new.id and s.deleted_at is null loop
      prob := plan_shipment_problem(x);
      exit when prob is not null;
    end loop;
  elsif tg_table_name = 'local_moves' then
    prob := plan_local_loading_problem(new.id);
  end if;
  if prob is not null then
    raise exception 'plan rule broken: %', prob using errcode = '23514', hint = 'plan:' || split_part(prob, ':', 1);
  end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_rt_window_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  rid bigint; s timestamptz; e timestamptz;
begin
  -- 071 (spec 2.1): start_at / end_at of a v5 cycle are written ONLY here, from its live stops; date_start /
  -- date_end are their Athens days, so the payroll line (011 dl_sync_from_rt) and DKV follow the stops.
  foreach rid in array array_remove(array[case when tg_op <> 'DELETE' then new.rt_id end,
                                          case when tg_op <> 'INSERT' then old.rt_id end], null) loop
    select min(planned_from), max(planned_to) into s, e from rt_stops where rt_id = rid and deleted_at is null;
    -- no live stop left: the window stays (the cycle is cancelled, or gets new stops, in the same transaction)
    continue when s is null;
    update ct_round_trips
       set start_at = s, end_at = e,
           date_start = (s at time zone 'Europe/Athens')::date, date_end = (e at time zone 'Europe/Athens')::date,
           updated_at = now()
     where id = rid and model = 2 and (start_at, end_at) is distinct from (s, e);
  end loop;
  return null;
end
$f$;

  CREATE FUNCTION public.ct_rt_legs_v2_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
begin
  -- 071: an order link is the v1 way to fill a round trip (033/034/037, POST /costs/rt). A v5 cycle is filled
  -- only by plan_* through rt_stops / piece_legs; refusing here keeps every v1 trigger away from it.
  if exists (select 1 from ct_round_trips where id = new.rt_id and model = 2) then
    raise exception 'plan rule broken: an order link cannot attach to the v5 cycle %', new.rt_id
      using errcode = '23514', hint = 'plan:v1_link_on_v2';
  end if;
  return new;
end
$f$;

  -- 8. The 9 triggers.
  CREATE TRIGGER ct_rt_legs_v2_guard BEFORE INSERT OR UPDATE OF rt_id ON public.ct_rt_legs
    FOR EACH ROW EXECUTE FUNCTION public.ct_rt_legs_v2_guard();
  CREATE TRIGGER plan_rt_window_sync AFTER INSERT OR UPDATE OR DELETE ON public.rt_stops
    FOR EACH ROW EXECUTE FUNCTION public.plan_rt_window_sync();
  CREATE CONSTRAINT TRIGGER plan_chk_rt AFTER INSERT OR UPDATE ON public.ct_round_trips
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_stops AFTER INSERT OR UPDATE OR DELETE ON public.rt_stops
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_legs AFTER INSERT OR UPDATE OR DELETE ON public.piece_legs
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_pieces AFTER INSERT OR UPDATE OR DELETE ON public.shipment_pieces
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_shipments AFTER INSERT OR UPDATE OR DELETE ON public.shipments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_bridge_stop AFTER UPDATE OF pallets, deleted_at ON public.order_stops
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (old.pallets IS DISTINCT FROM new.pallets OR old.deleted_at IS DISTINCT FROM new.deleted_at)
    EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_local_loading AFTER INSERT OR UPDATE ON public.local_moves
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (new.move_kind = 'nat_loading')
    EXECUTE FUNCTION public.plan_chk();

  -- 9. Today's functions learn model=2: the LIVE text + one line, generated (never retyped) and proven
  -- reversible. CREATE OR REPLACE keeps the oid, owner, grants and the triggers that call them.
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', sg_old, sg_new, 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.rt_recompute(bigint)', rc_old, rc_new, '5fa0a08418147b22d2852db3b8c72c3e'),
      ('public.rt_auto_close(bigint)', ac_old, ac_new, 'eba2146ca4c521da6365edd28c4507af'),
      ('public.dl_local_day_sync(bigint,date)', ls_old, ls_new, '151dab06e2676f3c8885d7298d0ac6af')) v(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig);
    IF (length(v_src) - length(replace(v_src, v_fn.a, ''))) <> length(v_fn.a) THEN
      RAISE EXCEPTION '071: the substitution target is not in % exactly once - stop', v_fn.sig;
    END IF;
    v_new := replace(v_src, v_fn.a, v_fn.b);
    IF replace(v_new, v_fn.b, v_fn.a) <> v_src OR md5(v_new) <> v_fn.m THEN
      RAISE EXCEPTION '071: the generated text of % is not the one measured (md5 %) - stop', v_fn.sig, md5(v_new);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      split_part(v_fn.sig, '(', 1), pg_get_function_arguments(to_regprocedure(v_fn.sig)),
      pg_get_function_result(to_regprocedure(v_fn.sig)), v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) <> v_fn.m THEN
      RAISE EXCEPTION '071 proof: % does not hold the generated text', v_fn.sig;
    END IF;
  END LOOP;

  -- 10. Born closed.
  ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.shipment_pieces ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.rt_stops ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.piece_legs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.plan_notices ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.shipments, public.shipment_pieces, public.rt_stops, public.piece_legs, public.plan_notices,
    public.v_shipments, public.v_piece_pos, public.v_piece_state, public.v_rt_stop_state, public.v_rt_cycle,
    public.v_hub_bucket, public.v_national_order_state, public.v_vs_state
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON public.shipments, public.shipment_pieces, public.rt_stops, public.piece_legs, public.plan_notices,
    public.v_shipments, public.v_piece_pos, public.v_piece_state, public.v_rt_stop_state, public.v_rt_cycle,
    public.v_hub_bucket, public.v_national_order_state, public.v_vs_state
    TO service_role, tms_reader, tms_check_runner;
  REVOKE ALL ON SEQUENCE public.shipments_id_seq, public.shipment_pieces_id_seq, public.rt_stops_id_seq,
    public.piece_legs_id_seq, public.plan_notices_id_seq FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.plan_chk(), public.plan_rt_window_sync(), public.ct_rt_legs_v2_guard(),
    public.plan_shipment_problem(bigint), public.plan_leg_problem(bigint), public.plan_rt_problem(bigint),
    public.plan_local_loading_problem(bigint) FROM PUBLIC, anon, authenticated, service_role;

  -- 11. PROOFS.
  EXECUTE snap_rt_sql INTO v_rt1;
  EXECUTE snap_rows_sql INTO v_rows1;
  IF v_rt1 <> v_rt0 OR v_rows1 <> v_rows0 THEN
    RAISE EXCEPTION '071 proof: a number of today changed (round trips % -> %, rows % -> %)', v_rt0, v_rt1, v_rows0, v_rows1;
  END IF;
  IF (SELECT count(*) FROM public.ct_round_trips WHERE model <> 1) <> 0
     OR (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
        + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
        + (SELECT count(*) FROM public.plan_notices) <> 0
     OR (SELECT count(*) FROM public.locations WHERE is_hub) <> 1 THEN
    RAISE EXCEPTION '071 proof: a new table has rows, a round trip is not model 1, or the hub is not exactly one';
  END IF;
  SELECT count(*) INTO v_k FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'v_shipments',
                       'v_piece_pos', 'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket',
                       'v_national_order_state', 'v_vs_state')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
  IF v_k <> 0 THEN RAISE EXCEPTION '071 proof: % new relation(s) are open to anon / authenticated / service_role writes', v_k; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
              AND relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices') AND NOT relrowsecurity)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices')) THEN
    RAISE EXCEPTION '071 proof: RLS off or a policy on a new table';
  END IF;
  SELECT count(*) INTO v_k FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_chk', 'plan_rt_window_sync', 'ct_rt_legs_v2_guard', 'plan_shipment_problem',
                       'plan_leg_problem', 'plan_rt_problem', 'plan_local_loading_problem')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_k <> 0 THEN RAISE EXCEPTION '071 proof: % new function(s) executable by an API role', v_k; END IF;

  -- B-54: exactly nine triggers more.
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 9 THEN
    RAISE EXCEPTION '071 proof: trigger count % -> % (expected +9)', v_trg0, v_trg1;
  END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '071: B-54 not updated (% rows)', v_k; END IF;

  RAISE NOTICE '071 OK: v5 schema in place, 0 rows, hub %, four functions learnt model=2; triggers % -> %, B-54 = %',
    v_hub, v_trg0, v_trg1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regclass('public.shipments') IS NOT NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '5fa0a08418147b22d2852db3b8c72c3e'
            THEN '071 OK' ELSE '071 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 1) AS v1_cycles,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles,
       (SELECT name FROM public.locations WHERE is_hub) AS hub;
