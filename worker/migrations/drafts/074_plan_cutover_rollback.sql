-- 074 ROLLBACK - the emergency road back, ONLY before the point of no return (plan section 1). ONE DO block, ASCII.
-- First 074_plan_cutover_rollback_dryrun.sql (this block + a deliberate error: nothing kept), then this file; after
-- 074b's rollback (074b's checks read the functions dropped here). Only with the owner's explicit yes, after 15:00.
-- REFUSES when anything a PERSON did in v5 exists: a live piece_legs / rt_stops, a national order with a live
-- shipment, a live nat_loading, or an audit_log row on a v5 table by anyone but 074 itself (backfill / bridge
-- trigger) since day L was written. Then only corrections forward, with a new migration.
-- OTHERWISE, in one transaction:
--   plan_config's one row deleted FIRST (every 074 trigger is inert from that line on; the table and
--   plan_config_read stay: they are 074a's and the Worker of deploy 1 calls them); bridges and pieces soft-deleted
--   ('074 rollback'); the national loads of plan_cutover_log live again with every row their soft delete cascaded
--   (their own stops, ramp lines, local moves: same deleted_at); the test rows back (GL to their old status and
--   cons_load_id); via_hub false; 028 / 030 / plan_vs_set_place back to their live text byte for byte (md5 of 074
--   PART 0); the 6 triggers and 14 functions of 074 dropped; plan_cutover_log dropped; B-54 back.
-- EXPECTED: NOTICE "074 ROLLBACK OK: ...".
DO $do$
DECLARE
  a_028 CONSTANT text := E'  if d_cd <> 0 and new.veroia_switch then\n';
  b_028 CONSTANT text := E'  if d_cd <> 0 and new.veroia_switch and plan_cutover_day() is null then -- 074: from day L the old national loads follow nothing\n';
  a_030 CONSTANT text := E'  if target is null or not coalesce(new.veroia_switch, false) then return null; end if;\n';
  b_030 CONSTANT text := E'  if target is null or not coalesce(new.veroia_switch, false) or plan_cutover_day() is not null then return null; end if; -- 074: from day L the old national loads follow nothing\n';
  b_rp CONSTANT text := E'    -- 074: the legs follow the new place through plan_h_vs_repoint, the ONE copy the F5 bridge calls too\n'
    || E'    select r.legs, r.stops into v_legs, v_stops\n'
    || E'      from plan_h_vs_repoint(v_sh, v_kind, v_old_loc, v_loc, w_repoint, p_actor, p_role) r;\n';
  rp_begin CONSTANT text := E'rs rt_stops%rowtype; x record;\nbegin\n';
  rp_tail CONSTANT text := E'  legs := v_legs;\n  stops := v_stops;\nend\n';
  v_opened timestamptz; v_src text; v_rp text; v_new text; v_block text; v_g record; x record; v_k int;
  v_trg0 int; v_trg1 int; v_sh int := 0; v_nl int := 0; v_t int := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.plan_cutover_log') IS NULL OR to_regprocedure('public.plan_bridge_sync(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '074 rollback: 074 is not applied';
  END IF;
  SELECT opened_at INTO v_opened FROM public.plan_config WHERE id = 1;
  IF v_opened IS NULL THEN RAISE EXCEPTION '074 rollback: plan_config holds no day L - stop, re-measure'; END IF;
  -- the point of no return (plan section 1)
  IF EXISTS (SELECT 1 FROM public.piece_legs WHERE deleted_at IS NULL) OR EXISTS (SELECT 1 FROM public.rt_stops WHERE deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.shipments WHERE nat_order_id IS NOT NULL AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.local_moves WHERE move_kind = 'nat_loading' AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.audit_log WHERE created_at >= v_opened
                  AND table_name IN ('shipments', 'shipment_pieces', 'piece_legs', 'rt_stops', 'ct_round_trips', 'plan_notices', 'rt_vehicle_segments')
                  AND actor NOT IN ('074 backfill', 'trigger:plan_bridge_sync')) THEN
    RAISE EXCEPTION '074 rollback: after the point of no return (a person already planned in v5) - only corrections forward';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- 1. day L out: every 074 trigger is inert from here (plan_cutover_day() is NULL)
  DELETE FROM public.plan_config WHERE id = 1;
  -- 2. the bridges: soft only (071 hard_delete); plan_h_vs_in_v5 skips '074 rollback' rows, so a later 074 starts clean
  UPDATE public.shipment_pieces SET deleted_at = now(), deleted_reason = '074 rollback', deleted_by = '074 rollback'
   WHERE deleted_at IS NULL;
  UPDATE public.shipments SET deleted_at = now(), deleted_reason = '074 rollback', deleted_by = '074 rollback'
   WHERE deleted_at IS NULL AND order_stop_id IS NOT NULL;
  GET DIAGNOSTICS v_sh = ROW_COUNT;
  UPDATE public.order_stops SET via_hub = false WHERE via_hub;
  -- 3. the old rows back, with what their soft delete cascaded at the same instant (national_loads_soft_delete_cascade:
  --    the NL's own stops, ramp lines and local moves; national_orders_soft_delete_cascade: its NL and stops)
  FOR x IN SELECT * FROM public.plan_cutover_log ORDER BY id DESC LOOP
    IF x.kind = 'gl_unassigned' THEN
      UPDATE public.groupage_lines SET status = x.before_data->>'status', cons_load_id = (x.before_data->>'cons_load_id')::bigint
       WHERE id = x.row_id;
    ELSIF x.table_name = 'national_loads' THEN
      UPDATE public.national_loads SET deleted_at = NULL WHERE id = x.row_id AND deleted_at = x.at;
      UPDATE public.order_stops SET deleted_at = NULL WHERE national_load_id = x.row_id AND deleted_at = x.at;
      UPDATE public.ramp SET deleted_at = NULL WHERE national_load_id = x.row_id AND deleted_at = x.at;
      UPDATE public.local_moves SET deleted_at = NULL WHERE parent_nat_load_id = x.row_id AND deleted_at = x.at;
      IF x.kind = 'nl_unlinked' THEN v_nl := v_nl + 1; END IF;
    ELSIF x.table_name = 'national_orders' THEN
      UPDATE public.national_orders SET deleted_at = NULL WHERE id = x.row_id AND deleted_at = x.at;
      UPDATE public.order_stops SET deleted_at = NULL WHERE national_order_id = x.row_id AND deleted_at = x.at;
      UPDATE public.national_loads SET deleted_at = NULL WHERE source_national_order_id = x.row_id AND deleted_at = x.at;
    ELSIF x.table_name = 'consolidated_loads' THEN
      UPDATE public.consolidated_loads SET deleted_at = NULL WHERE id = x.row_id AND deleted_at = x.at;
    END IF;
    IF x.kind <> 'nl_unlinked' THEN v_t := v_t + 1; END IF;
    INSERT INTO public.audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    VALUES ('074 rollback', 'system', 'update', x.table_name, x.row_id::text, NULL,
            jsonb_build_object('reason', '074 rollback: ' || x.kind), now());
  END LOOP;

  -- 4. the texts back, byte for byte (the md5 074 PART 0 guarded on)
  FOR v_g IN SELECT * FROM (VALUES
      ('public.order_dates_follow()', a_028, b_028, '4b5d279f21f981a11d35a5deb655269a'),
      ('public.national_load_follow_order()', a_030, b_030, '66f079523fb3d7d91dd196b0df272e9a')) g(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF (length(v_src) - length(replace(v_src, v_g.b, ''))) <> length(v_g.b) THEN
      RAISE EXCEPTION '074 rollback: the 074 line is not in % exactly once - stop', v_g.sig;
    END IF;
    v_new := replace(v_src, v_g.b, v_g.a);
    IF md5(v_new) <> v_g.m THEN RAISE EXCEPTION '074 rollback: % would not be its live text (md5 %)', v_g.sig, md5(v_new); END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), v_new);
  END LOOP;
  -- plan_vs_set_place: its loop comes back from plan_h_vs_repoint, where 074 moved it (never retyped)
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.plan_vs_set_place(jsonb,text,text)'::regprocedure;
  SELECT prosrc INTO v_rp FROM pg_proc WHERE oid = 'public.plan_h_vs_repoint(bigint,text,bigint,bigint,text,text,text)'::regprocedure;
  IF strpos(v_rp, rp_begin) = 0 OR right(v_rp, length(rp_tail)) <> rp_tail
     OR (length(v_src) - length(replace(v_src, b_rp, ''))) <> length(b_rp) THEN
    RAISE EXCEPTION '074 rollback: plan_vs_set_place / plan_h_vs_repoint are not the texts 074 wrote - stop';
  END IF;
  v_block := substr(v_rp, strpos(v_rp, rp_begin) + length(rp_begin));
  v_block := left(v_block, length(v_block) - length(rp_tail));
  v_new := replace(v_src, b_rp, v_block);
  IF md5(v_new) <> '8a7280968075a8a56c9a42edd4b47e24' THEN
    RAISE EXCEPTION '074 rollback: plan_vs_set_place would not be its live text (md5 %)', md5(v_new);
  END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_vs_set_place(p jsonb, p_actor text, p_role text) RETURNS jsonb '
    || 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', v_new);

  -- 5. 074's triggers and functions
  DROP TRIGGER plan_bridge_on_order ON public.orders;
  DROP TRIGGER plan_bridge_on_stop ON public.order_stops;
  DROP TRIGGER plan_legacy_frozen ON public.national_loads;
  DROP TRIGGER plan_legacy_frozen ON public.groupage_lines;
  DROP TRIGGER plan_legacy_frozen ON public.consolidated_loads;
  DROP TRIGGER plan_legacy_frozen ON public.local_moves;
  DROP FUNCTION public.plan_bridge_on_order();
  DROP FUNCTION public.plan_bridge_on_stop();
  DROP FUNCTION public.plan_legacy_frozen();
  DROP FUNCTION public.plan_bridge_sync(bigint, text);
  DROP FUNCTION public.plan_h_bridge_place(bigint, bigint, bigint, text, text);
  DROP FUNCTION public.plan_h_bridge_recut(bigint, text, text, text);
  DROP FUNCTION public.plan_h_bridge_unplan(bigint, bigint, text, text, text);
  DROP FUNCTION public.plan_h_bridge_retire(bigint, text, text, text);
  DROP FUNCTION public.plan_h_bridge_drop(bigint[], text, text, text);
  DROP FUNCTION public.plan_h_vs_repoint(bigint, text, bigint, bigint, text, text, text);
  DROP FUNCTION public.plan_h_bridge_executed(bigint);
  DROP FUNCTION public.plan_h_bridge_wanted(bigint);
  DROP FUNCTION public.plan_h_vs_in_v5(bigint);
  DROP FUNCTION public.plan_h_vs_nat_side(text, text);
  DROP TABLE public.plan_cutover_log;

  -- 6. proofs + B-54
  IF EXISTS (SELECT 1 FROM public.shipments WHERE deleted_at IS NULL) OR EXISTS (SELECT 1 FROM public.shipment_pieces WHERE deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.order_stops WHERE via_hub) OR EXISTS (SELECT 1 FROM public.plan_config) THEN
    RAISE EXCEPTION '074 rollback proof: a live bridge, a piece, a via_hub or day L is left';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 - 6 THEN RAISE EXCEPTION '074 rollback proof: triggers % -> %, expected -6', v_trg0, v_trg1; END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '074 rollback: B-54 not updated (% rows)', v_k; END IF;
  RAISE NOTICE '074 ROLLBACK OK: bridges withdrawn %, NL back %, test rows back %, triggers % -> %, B-54 %', v_sh, v_nl, v_t, v_trg0, v_trg1, v_trg1;
END $do$;
