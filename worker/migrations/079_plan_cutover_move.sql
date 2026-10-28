-- 079 - NATIONAL v5: DAY L MOVES BACK ONE WEEK, from Saturday 31/10/2026 to Saturday 24/10/2026 (owner 28/10: this
-- week's national jobs are entered on their REAL dates, not shifted +7 to reach v5). 078 is PR #140's audit_actions.
-- ONE DO block (the Supabase SQL editor is not atomic across statements, lesson 056). ASCII only.
-- The owner runs it after 15:00, with an explicit yes, in this order:
--   1. 079_plan_cutover_move_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 079_plan_cutover_move.sql          (this file)
--   3. 079_plan_cutover_move_verify.sql   read-only, one row
--   4. every open TMS tab reloads (F5): core/plan-config.js keeps 'after' with its day for the life of the tab, so a
--      tab opened before 079 still draws the week of 24/10 as the old view (whose NLs 079 unlinks)
-- WHY THIS IS ENOUGH (read on production 28/10, SELECT only): the base reads day L in ONE place (plan_cutover_day(),
--   074a). Its readers: plan_h_vs_in_v5 (the cut: hub day >= L, or bridged once), the bridge triggers and the freeze
--   / 028 / 030 (they only ask "is L set" - already yes, unchanged), plan_config_read (the Worker's GET /plan/config,
--   the front end's _afterL), B-95 / B-26 (the cut, rewritten without functions). B-96..B-98 count from opened_at:
--   it stays 28/10 11:39 (the moment the old model froze), so they keep counting from the same instant.
-- WHAT, in one transaction:
--   PART 0  guards: 074, 074b, 075, 076 applied; the md5 of every live text 079 calls or that reads L; L = 31/10 now;
--           the new day a Saturday, before L and not after today (Athens); B-54 = the live triggers; B-95's equality
--           holds before (so the proof below can only be about 079)
--   PART 1  plan_config: the CHECK plan_config_future (074a: "L after the day it was opened") cannot hold a day L moved
--           into the past while opened_at stays (B-96..B-98). It is replaced by plan_config_floor ("L never before
--           24/10", the day the owner approved): the table still refuses an L further back, whoever writes it
--           (principle 4). Then the UPDATE, with one audit_log row before / after (plan_cutover_log takes only its 3
--           kinds of old rows - it is not written here, only by plan_bridge_sync itself)
--   PART 2  the backfill: plan_bridge_sync(id, '079 backfill') on every live VS whose hub day is in [24/10, 31/10) -
--           074's own sync, unchanged: bridges, via_hub, the live Direct NL unlinked into plan_cutover_log, a
--           legacy_nl_replaced notice for an NL that was already moving. Their soft delete cascades as in 074
--           (national_loads_soft_delete_cascade): the NL's own stops, ramp lines and local moves leave the old screens
--           (the Daily Ramp board included) - counted before, declared in the NOTICE, proven gone after
--   PART 3  proofs (as 074 PART 8): the deferred rules of 071 fire here; B-95's equality on every stop, B-78 0, every
--           window VS bridged, NL unlinked = the window VS that had one, no leg / stop / other notice written, no
--           trigger more, B-54 unchanged; NOTICE "079 OK: ..."
-- RISKS the owner accepted (old national data has no value, 28/10): the window VS already Delivered / In Transit show
--   their pieces TO ASSIGN and late until the desk records them in v5 (B-81 red meanwhile); a Delivered NL leaves the
--   old board with a legacy_nl_replaced notice. To confirm with the owner (measured 28/10 16:10): the 8 NL take 21 of
--   their own stops and 4 Planned ramp lines (25/10, 26/10 x2, 28/10) off the old screens and the Daily Ramp board.
-- REVERSE: 079_plan_cutover_move_rollback.sql (L back to 31/10 and plan_config_future back; the bridges 079 brought
--   retired with the one reason the cut ignores; their NL restored from plan_cutover_log). It refuses once a person
--   planned one of those pieces.
DO $do$
DECLARE
  -- the move (owner 28/10). c_old is what 074 wrote; c_new the approved day
  c_old CONSTANT date := DATE '2026-10-31';
  c_new CONSTANT date := DATE '2026-10-24';
  v_today date; v_trg0 int; v_trg1 int; v_k int; v_g record; x record;
  v_legs0 bigint; v_stops0 bigint; v_via0 bigint; v_via1 bigint; v_vs int := 0; v_had_nl int := 0;
  v_sh int; v_nl int; v_nlveh text; v_days text; v_opened timestamptz; v_nls bigint[]; v_cas_stops int; v_cas_ramp int; v_cas_lm int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  v_today := (now() AT TIME ZONE 'Europe/Athens')::date;

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regclass('public.plan_cutover_log') IS NULL OR to_regprocedure('public.plan_bridge_sync(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '079: 074 is not applied (plan_cutover_log / plan_bridge_sync) - stop';
  END IF;
  IF (SELECT count(*) FROM monitoring.checks WHERE id IN ('B-95', 'B-96', 'B-97', 'B-98', 'B-99')) <> 5 THEN
    RAISE EXCEPTION '079: 074b (B-95..B-99) is not applied - stop';
  END IF;
  IF to_regprocedure('public.plan_h_side_dir(text)') IS NULL OR to_regprocedure('public.plan_h_dir_side(text)') IS NULL THEN
    RAISE EXCEPTION '079: 075 is not applied - stop';
  END IF;
  IF md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) <> 'a4750de0d409439961612a18adbc8a58' THEN
    RAISE EXCEPTION '079: 076 is not applied (v_rt_stop_state md5 %) - stop', md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true));
  END IF;
  -- the LIVE texts 079 calls (the sync and what it calls) or that read day L, as 074 / 075 left them (md5 of prosrc,
  -- measured on production 28/10 by SELECT). plan_orders_create / plan_order_update are NOT here: neither reads L,
  -- 079 calls neither, and 077 (order edit) rewrites plan_order_update - a guard on it would only couple the two.
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_cutover_day()', 'cc71e7dd7b92bef40b0e032d6498e5d4'),
      ('public.plan_config_read()', '7bfaf5fd8b39fb96b7977299e68d0068'),
      ('public.plan_bridge_sync(bigint,text)', '3a94d6925b43dec17e26da59447d517c'),
      ('public.plan_h_vs_in_v5(bigint)', 'c40bb510fc7b24fe6f37f4ce85c32370'),
      ('public.plan_h_bridge_wanted(bigint)', 'b53c50f4398f90c43bf9912b41a94271'),
      ('public.plan_h_vs_nat_side(text,text)', '0409c8af425ca8cd12d287fd997ed2d1'),
      ('public.plan_h_bridge_retire(bigint,text,text,text)', 'af362bc81559d49e570fdca5f7c86f2c'),
      ('public.plan_h_bridge_drop(bigint[],text,text,text)', '959888e31eb29710d552cd004127c55f'),
      ('public.plan_h_bridge_executed(bigint)', '3872b12fec9e5618d0f0bf23a8fd0b10'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_notice(text,text,text,text[],bigint,bigint,bigint,text,text)', '879f3396df6c4c730edb27550ff08c6b'),
      ('public.plan_bridge_on_order()', '90cc2010915885ac441095fd83de863e'),
      ('public.plan_bridge_on_stop()', 'c133ef3f4928da5a625af58072e5af32'),
      ('public.plan_legacy_frozen()', '8b5ff9e56a66cc141109abef26ddfc5b'),
      ('public.order_dates_follow()', 'a55eb83e75fc4e442ea026f4a6c858e5'),
      ('public.national_load_follow_order()', 'e6e1982837e46390b7a4dac514616ffb'),
      ('public.plan_vs_set_place(jsonb,text,text)', 'c8814ab08d0a86cfb77b79a89b9ba8a8'),
      ('public.plan_board(date,text)', '670f72f60edcf09f955fb1f6a74143b9')
    ) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '079: % is not the live text measured 28/10 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  IF (SELECT cutover_day FROM public.plan_config WHERE id = 1) = c_new THEN
    RAISE EXCEPTION '079: day L is already % - run 079_plan_cutover_move_verify.sql instead', c_new;
  END IF;
  IF (SELECT cutover_day FROM public.plan_config WHERE id = 1) IS DISTINCT FROM c_old THEN
    RAISE EXCEPTION '079: day L is not % (074''s) but % - stop, re-measure', c_old, (SELECT cutover_day FROM public.plan_config WHERE id = 1);
  END IF;
  IF (SELECT string_agg(conname || '=' || pg_get_constraintdef(oid), ' ; ' ORDER BY conname) FROM pg_constraint
       WHERE conrelid = 'public.plan_config'::regclass AND contype = 'c')
     IS DISTINCT FROM 'plan_config_future=CHECK ((cutover_day > ((opened_at AT TIME ZONE ''Europe/Athens''::text))::date)) ; '
       || 'plan_config_one=CHECK ((id = 1)) ; plan_config_saturday=CHECK ((EXTRACT(isodow FROM cutover_day) = (6)::numeric))' THEN
    RAISE EXCEPTION '079: the CHECKs of plan_config are not 074a''s three - stop, re-measure';
  END IF;
  IF extract(isodow FROM c_new) <> 6 OR c_new >= c_old OR c_new > v_today THEN
    RAISE EXCEPTION '079: the new day L % is not a Saturday before % and not after today % (Athens)', c_new, c_old, v_today
      USING ERRCODE = '23514', HINT = 'plan:bad_cutover_day';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '079: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;
  -- B-95's equality before: a gap that is already there is not 079's, and the proof below must not hide it
  IF EXISTS (SELECT 1 FROM public.order_stops s WHERE s.order_id IS NOT NULL
              AND (plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
                   OR s.via_hub <> plan_h_bridge_wanted(s.id))) THEN
    RAISE EXCEPTION '079: B-95 is red before 079 (a bridge or via_hub differs from the wanted stops) - stop, ask';
  END IF;
  -- as 074: the proof "NL unlinked = VS that had one" needs one live Direct NL per VS at most
  IF EXISTS (SELECT 1 FROM public.national_loads nl JOIN public.orders o ON o.id = nl.source_order_id
              WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.cross_dock_date >= c_new AND o.cross_dock_date < c_old
                AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL GROUP BY o.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION '079: a VS of the week has more than one live Direct national load - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_legs0 FROM public.piece_legs;
  SELECT count(*) INTO v_stops0 FROM public.rt_stops;
  SELECT count(*) INTO v_via0 FROM public.order_stops WHERE via_hub;
  SELECT opened_at INTO v_opened FROM public.plan_config WHERE id = 1;
  -- the NL the sync will unlink - those of a VS of the week (Cancelled aside) with a stop to bridge: a live stop with
  -- pallets on its national side (plan_h_bridge_wanted under the new day; a VS with none keeps its NL, as in 074) -
  -- and what their soft delete will take with it (principle 1: declared, never silent)
  SELECT coalesce(array_agg(nl.id ORDER BY nl.id), '{}') INTO v_nls FROM public.national_loads nl JOIN public.orders o ON o.id = nl.source_order_id
   WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled'
     AND o.cross_dock_date >= c_new AND o.cross_dock_date < c_old AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.order_stops s WHERE s.order_id = o.id AND s.deleted_at IS NULL AND coalesce(s.pallets, 0) > 0
                   AND plan_h_vs_nat_side(o.direction, s.stop_type));
  SELECT count(*) INTO v_cas_stops FROM public.order_stops WHERE national_load_id = ANY (v_nls) AND deleted_at IS NULL;
  SELECT count(*) INTO v_cas_ramp FROM public.ramp WHERE national_load_id = ANY (v_nls) AND deleted_at IS NULL;
  SELECT count(*) INTO v_cas_lm FROM public.local_moves WHERE parent_nat_load_id = ANY (v_nls) AND deleted_at IS NULL;

  -- ===== PART 1: DAY L =====
  ALTER TABLE public.plan_config DROP CONSTRAINT plan_config_future;
  ALTER TABLE public.plan_config ADD CONSTRAINT plan_config_floor CHECK (cutover_day >= DATE '2026-10-24');
  UPDATE public.plan_config SET cutover_day = c_new WHERE id = 1 AND cutover_day = c_old;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '079: plan_config not updated (% rows)', v_k; END IF;
  -- the one trace of the move (the rollback reads its instant: the bridges born from here are 079's)
  INSERT INTO public.audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  VALUES ('079', 'system', 'update', 'plan_config', '1', jsonb_build_object('cutover_day', c_old),
          jsonb_build_object('cutover_day', c_new, 'reason', 'day L moved back one week (owner 28/10, 079)'), now());

  -- ===== PART 2: THE BACKFILL (074's sync, the week that entered v5) =====
  FOR x IN SELECT o.id, EXISTS (SELECT 1 FROM public.national_loads nl WHERE nl.source_order_id = o.id
                                  AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL) AS had_nl
             FROM public.orders o
            WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.cross_dock_date >= c_new AND o.cross_dock_date < c_old
            ORDER BY o.id LOOP
    PERFORM public.plan_bridge_sync(x.id, '079 backfill');
    -- a VS of the week that was already v5 ("once v5": 074 bridged it, the desk moved it back) is not counted
    IF EXISTS (SELECT 1 FROM public.shipments WHERE order_id = x.id AND created_by = '079 backfill' AND deleted_at IS NULL) THEN
      v_vs := v_vs + 1;
      IF x.had_nl THEN v_had_nl := v_had_nl + 1; END IF;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  -- 071's deferred rules (pieces_sum, plan_chk_bridge_stop) fire HERE, not at COMMIT: the dry run proves them too
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*) INTO v_sh FROM public.shipments WHERE created_by = '079 backfill' AND deleted_at IS NULL;
  SELECT count(*) INTO v_nl FROM public.plan_cutover_log WHERE kind = 'nl_unlinked' AND reason = '079 backfill';
  SELECT coalesce(string_agg(l.row_id::text, ',' ORDER BY l.row_id), '-') INTO v_nlveh FROM public.plan_cutover_log l
   WHERE l.kind = 'nl_unlinked' AND l.reason = '079 backfill' AND l.before_data->>'status' IS DISTINCT FROM 'Cancelled'
     AND (l.before_data->>'truck_id' IS NOT NULL OR l.before_data->>'partner_id' IS NOT NULL
          OR l.before_data->>'status' IS DISTINCT FROM 'Pending');
  SELECT count(*) INTO v_via1 FROM public.order_stops WHERE via_hub;
  SELECT coalesce(string_agg(d || ':' || n, ' ' ORDER BY d), '-') INTO v_days FROM (
    SELECT to_char(o.cross_dock_date, 'MM-DD') AS d, count(DISTINCT o.id) AS n FROM public.orders o
     WHERE EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.created_by = '079 backfill' AND s.deleted_at IS NULL)
     GROUP BY 1) q;
  IF EXISTS (SELECT 1 FROM public.order_stops s WHERE s.order_id IS NOT NULL
              AND (plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
                   OR s.via_hub <> plan_h_bridge_wanted(s.id))) THEN
    RAISE EXCEPTION '079 proof: the bridges (or via_hub) are not exactly the national-side stops of the VS in v5';
  END IF;
  -- every live VS of the week is in v5 now (not Cancelled), and bridged when it has a stop to bridge
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled'
              AND o.cross_dock_date >= c_new AND o.cross_dock_date < c_old
              AND (NOT plan_h_vs_in_v5(o.id)
                   OR (EXISTS (SELECT 1 FROM public.order_stops s WHERE s.order_id = o.id AND plan_h_bridge_wanted(s.id))
                       AND NOT EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_id = o.id AND b.deleted_at IS NULL)))) THEN
    RAISE EXCEPTION '079 proof: a VS of the week %..% is not in v5 or not bridged', c_new, c_old - 1;
  END IF;
  IF v_via1 - v_via0 <> v_sh OR (SELECT count(*) FROM public.shipment_pieces sp JOIN public.shipments s ON s.id = sp.shipment_id
        WHERE s.created_by = '079 backfill' AND sp.deleted_at IS NULL AND s.deleted_at IS NULL) <> v_sh THEN
    RAISE EXCEPTION '079 proof: bridges %, via_hub % -> % - expected one piece and one via_hub more per bridge', v_sh, v_via0, v_via1;
  END IF;
  IF v_nl <> v_had_nl THEN RAISE EXCEPTION '079 proof: % NL unlinked for % VS of the week that had one', v_nl, v_had_nl; END IF;
  -- the NL unlinked are exactly the week's (Cancelled aside), and what their soft delete cascaded is gone with them
  IF (SELECT coalesce(array_agg(row_id ORDER BY row_id), '{}') FROM public.plan_cutover_log WHERE kind = 'nl_unlinked' AND reason = '079 backfill') <> v_nls
     OR EXISTS (SELECT 1 FROM public.order_stops WHERE national_load_id = ANY (v_nls) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.ramp WHERE national_load_id = ANY (v_nls) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.local_moves WHERE parent_nat_load_id = ANY (v_nls) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION '079 proof: the NL unlinked are not the week''s %, or a stop / ramp line / local move of theirs is still live', v_nls;
  END IF;
  -- B-78's rule: no order lives in both models
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.deleted_at IS NULL
              AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
              AND EXISTS (SELECT 1 FROM public.national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)) THEN
    RAISE EXCEPTION '079 proof: an order has a bridge AND a live Direct national load';
  END IF;
  -- 079 plans nothing: no leg, no cycle stop, and of the notices (created_at = now(): this transaction) only one
  -- legacy_nl_replaced per NL that was already moving
  IF (SELECT count(*) FROM public.piece_legs) <> v_legs0 OR (SELECT count(*) FROM public.rt_stops) <> v_stops0
     OR (SELECT count(*) FROM public.plan_notices WHERE created_at = now() AND kind <> 'legacy_nl_replaced') <> 0
     OR (SELECT count(*) FROM public.plan_notices WHERE created_at = now())
        <> (CASE WHEN v_nlveh = '-' THEN 0 ELSE cardinality(string_to_array(v_nlveh, ',')) END) THEN
    RAISE EXCEPTION '079 proof: legs, cycle stops or notices other than one legacy_nl_replaced per moving NL were written';
  END IF;
  IF (SELECT cutover_day FROM public.plan_config WHERE id = 1) <> c_new OR plan_cutover_day() <> c_new
     OR (plan_config_read()->>'cutover_day')::date <> c_new
     OR (SELECT opened_at FROM public.plan_config WHERE id = 1) IS DISTINCT FROM v_opened THEN
    RAISE EXCEPTION '079 proof: day L does not read % everywhere, or opened_at changed', c_new;
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg1) THEN
    RAISE EXCEPTION '079 proof: triggers % -> % (expected unchanged), or B-54 no longer matches', v_trg0, v_trg1;
  END IF;
  RAISE NOTICE '079 OK: cutover % -> %, bridges % on % VS (by hub day %), NL unlinked % (with their own stops %, ramp lines %, local moves %), NL to re-record % [%], via_hub % -> %, legs % (unchanged), triggers % (unchanged), B-54 %',
    c_old, c_new, v_sh, v_vs, v_days, v_nl, v_cas_stops, v_cas_ramp, v_cas_lm,
    CASE WHEN v_nlveh = '-' THEN 0 ELSE cardinality(string_to_array(v_nlveh, ',')) END, v_nlveh, v_via0, v_via1, v_legs0, v_trg1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN public.plan_cutover_day() = DATE '2026-10-24' THEN '079 OK' ELSE '079 NOT APPLIED' END AS result,
       public.plan_cutover_day() AS cutover_day,
       (SELECT opened_at FROM public.plan_config WHERE id = 1) AS opened_at,
       (SELECT count(*) FROM public.shipments WHERE created_by = '079 backfill' AND deleted_at IS NULL) AS bridges_079,
       (SELECT count(*) FROM public.shipments WHERE deleted_at IS NULL AND order_stop_id IS NOT NULL) AS bridges_all,
       (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub;
