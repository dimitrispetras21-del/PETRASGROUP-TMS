-- 073 - NATIONAL v5, PHASE F3: MONEY, ROUTE, PALLETS. NO NUMBER OF TODAY CHANGES.
--
-- DRAFT. Spec docs/superpowers/specs/2026-10-21-national-v5-design.md (owner 21/10, sections 3 Money, 5 E6-E11),
-- plan docs/superpowers/plans/2026-10-23-f3-national-v5-money-DRAFT.md (decisions D-1..D-20 as proposed with D-9
-- NARROW, owner choices M-1 gamma, M-2 alpha, M-3 beta - DECISION_LOG 24/10 and 25/10).
-- Runs ONLY after 072 (F2, executed 26/10) AND 072b (vehicle handover) - order 072 -> 072b -> 073; its guard reads the
-- LIVE texts of both. The owner runs it in the Supabase SQL
-- editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes, in this order:
--   0. 073_plan_money_fingerprint.sql   read-only (keep the row)
--   1. 073_plan_money_dryrun.sql        this block + a deliberate error: NOTHING kept
--   2. 073_plan_money.sql               (this file)
--   3. 073_plan_money_verify.sql        read-only, one row
--   4. 073_plan_money_fingerprint.sql   again: the same row as in step 0
--   5. 073_plan_money_test.sql          OPTIONAL on production (advances id and RT- sequences): the rules on TEST
--                                        rows, ends in a deliberate error, nothing kept
-- ASCII only (clipboard-safe; Greek texts are base64 or U&'' escapes). ONE DO block = ONE statement: an error
-- anywhere undoes all of it.
--
-- WHAT IT DOES (spec 5: views and functions that change nothing while no model=2 row exists):
--   E7  ct_v_v5_revenue (NEW, money): the price of a national order and the X of a VS order shared per pallet over
--       every pallet of the order's live shipments (spec 3 Money), each leaf's share split equally over every leg
--       that carried it (M-1 gamma); ct_v_rt_revenue adds it to revenue_natl of the v5 cycles, keeps today's whole X
--       charge on the international (M-2 alpha), and never counts X or a price twice (a VS order with a bridge gives
--       no X through a Direct NL, a national order with v5 shipments no price through its home NL).
--       ct_v_rt_costs: partner_planned of a v5 cycle = ct_round_trips.partner_rate (one per trip, spec 3).
--       ct_v_rt_pnl: + partner_rate_missing (last column): a v5 PARTNER trip without a rate shows as pending.
--   E9  dl_v_rt_route: + one block per side of a v5 cycle from rt_stops (KATHODOS first).
--   E11 plan_h_pallet_sync (NEW helper): the pallet feeder of a leg (taken follows the plan, the user's given stays),
--       called from 072's plan_h_leg_add,
--       plan_h_leg_drop, plan_order_update and plan_rt_update (one hook each, from their LIVE text, md5 before and
--       after); plan_h_drop_consequences lists confirmed pallet rows (pallets_confirmed). ct_v_rt_pallet_gate:
--       + the v5 legs. pl_mov_stop_once: one non-reversed LOADING / DELIVERY row per international stop (D-9 narrow)
--       - the guard against the double DELIVERY / LOADING of the browser feeder (GET-then-POST).
--   E6  stock_v_pieces: a national lot piece that has v5 shipments reads delivered / on_truck from 071's views.
--   E8  nothing: ct_v_wear_rate already ignores NULL km (proved by the rules test), the auditor counts them (073b).
-- WHAT IT DOES NOT: no table, no column, no trigger (B-54 stays), no change to ct_v_wear_rate, 011, 057's guards.
-- PROOF INSIDE THE BLOCK: every replaced or dependent view gives the same rows before and after, to the byte
-- (0 v5 rows today), with the same options and rights.
--
-- REVERSE: 073_plan_money_rollback.sql (refuses if any v5 row exists). Run it FIRST: then 072b's rollback, then 072's
-- (072b's rollback guards its hooked texts, which 073 changes).
-- EXPECTED: NOTICE "073 OK: ..." and ONE row: result = '073 OK', the view and function md5s of the plan, v5_rows 0.

DO $do$
DECLARE
  -- Every view 073 replaces, and every view that reads one of them, as ordered rows (spec 5 / master F3: "the rows
  -- of dl_v_rt_route and ct_v_rt_pnl equal to before"). The new last column of ct_v_rt_pnl is left out.
  snap_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_revenue v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_costs v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg((to_jsonb(v) - 'partner_rate_missing')::text, '|' ORDER BY v.id), '')) FROM public.ct_v_rt_pnl v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.truck_id), '')) FROM public.ct_v_wear_rate v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.dl_v_rt_route v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.dl_v_rt_gap v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.id), '')) FROM public.dl_v_entries v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.driver_id), '')) FROM public.dl_v_balance v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_pallet_gate v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.piece_kind, v.piece_id), '')) FROM public.stock_v_pieces v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.id), '')) FROM public.stock_v_lots v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.lot_id), '')) FROM public.stock_v_lot_money v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.lot_id, v.seq), '')) FROM public.stock_v_lot_alloc v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.order_id, v.rt_amount), '')) FROM public.stock_v_rt_amounts v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.id), '')) FROM public.pl_movements m),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.id), '')) FROM public.ct_round_trips r)) $q$;
  -- Options and rights of the replaced views: CREATE OR REPLACE VIEW keeps the pg_class row, so they must not move.
  rel_sql CONSTANT text := $q$
    SELECT string_agg(c.relname || '=' || coalesce(array_to_string(c.reloptions, ','), '-') || '/'
                      || coalesce(c.relacl::text, '-'), ' ' ORDER BY c.relname)
      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('ct_v_rt_revenue', 'ct_v_rt_costs', 'ct_v_rt_pnl', 'dl_v_rt_route', 'ct_v_rt_pallet_gate',
                         'stock_v_pieces') $q$;
  v_g record; v_src text; v_new text; v_def text; v_k int;
  v_trg0 int; v_trg1 int; v_snap0 text; v_snap1 text; v_rel0 text; v_rel1 text;
BEGIN
  -- CREATE OR REPLACE VIEW and CREATE INDEX take strong locks: behind an idle open transaction they would wait
  -- forever while every app read queues behind them. Give up after 5 s - the whole block rolls back.
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_h_raise(text,text)') IS NULL OR to_regprocedure('public.plan_board(date,text)') IS NULL
     OR to_regclass('public.pl_mov_leg_once') IS NULL OR to_regclass('public.rt_vehicle_segments') IS NULL THEN
    RAISE EXCEPTION '073: 071, 072 and 072b must be applied first (order 072 -> 072b -> 073)';
  END IF;
  IF to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NOT NULL OR to_regclass('public.ct_v_v5_revenue') IS NOT NULL
     OR to_regclass('public.pl_mov_stop_once') IS NOT NULL THEN
    RAISE EXCEPTION '073: already applied - run 073_plan_money_verify.sql instead';
  END IF;
  -- The views 073 replaces or reads, as the LIVE text (md5 of pg_get_viewdef(oid, true), the 057 convention).
  -- Any difference = stop: the new texts below were written against these.
  FOR v_g IN SELECT * FROM (VALUES
      ('public.ct_v_rt_revenue', '7bd4c2b3206af115a5cfff5478dfdfc9'),
      ('public.ct_v_rt_costs', '3349bcf0e25e567075243f94755de4ff'),
      ('public.ct_v_rt_pnl', 'abc2a49270d8ac7bda9852782ab21f78'),
      ('public.dl_v_rt_route', 'cfb5f85b913657fba8d8d365d38df323'),
      ('public.ct_v_rt_pallet_gate', '3672742c7ac8e537502058c8de6c8e8e'),
      ('public.stock_v_pieces', '9a17994f3476293c585e3ace7a07e2be'),
      ('public.ct_v_wear_rate', '1d2285a601dc9c1e74dc92cb2e76d880'),
      ('public.stock_v_rt_amounts', '4f655d64c230831cf17b66ea2230f486'),
      ('public.v_shipments', 'ea427b9516b1add5372a387e22b798f1'),
      ('public.v_piece_state', '598fd9472beaef97adaf49b1ff431504'),
      ('public.v_national_order_state', '4d2f22b0689f2fd3d17a330ed0005782'),
      ('public.v_rt_cycle', '47ca7d81be348ec9f7f7bddd8c6563d9')
    ) g(rel, m) LOOP
    IF to_regclass(v_g.rel) IS NULL OR md5(pg_get_viewdef(to_regclass(v_g.rel), true)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '073: view % is not the live text measured 23/10 and 26/10 (expected md5 %) - stop, re-measure', v_g.rel, v_g.m;
    END IF;
  END LOOP;
  -- The functions 073 calls or rewrites, as the LIVE text (md5 of prosrc, the 071/072 convention). 072 as executed
  -- 26/10, measured on production by SELECT (F3 Task 0). plan_h_drop_consequences and plan_rt_update carry 072b's
  -- hooks: those two md5s are DERIVED on the production-shaped PGlite copy from 072 + the 072b draft (production
  -- 26/10, before 072b: f5641bb97562310cbbc57d71e9894c26 / 0cce9dd2a29dd9ea35ac633f6338fca1) and are RE-DERIVED
  -- from production, by SELECT, after 072b runs; plan_order_update is untouched by 072b (production 3ce41ac4).
  FOR v_g IN SELECT * FROM (VALUES
      ('public.ct_setting(text)', '0c24249eb581a5004a3fb7db044eba2a'),
      ('public.stock_vs_charge(numeric,numeric)', 'd034c65b8610f668b29c5943d7976739'),
      ('public.stock_natl_delivered(text,date)', '3ffc433986175c63f7cd3da2453f94b2'),
      ('public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)', 'aa9645fa495976bbca7c7de0635f4c22'),
      ('public.plan_h_leg_drop(bigint,text,text,text)', '4533385f7284c9ba5af52cf585a03250'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])', '80b789fcdfc3fb6dad2b1d2f8b83b487'),
      ('public.plan_order_update(jsonb,text,text)', '3ce41ac45650910c1024cb0a8846176f'),
      ('public.plan_rt_update(jsonb,text,text)', 'e427e7a24ef6e88d83555c98d4bc7622')
    ) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '073: % is not the live text measured 26/10 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  -- "Before = after" is a proof only while no v5 row exists (spec 2.2); with the /plan/* writes closed until day L
  -- there is none (F2 decision 22).
  IF (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
     + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
     + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2)
     + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION '073: v5 rows exist - the before = after proof of this block does not hold (spec 2.2)';
  END IF;
  -- D-9 (narrow, 25/10): the unique index below must find nothing to refuse (measured 0 on 23/10 and 26/10)
  IF EXISTS (SELECT 1 FROM public.pl_movements WHERE order_stop_id IS NOT NULL AND status <> 'reversed'
                AND event_type IN ('LOADING', 'DELIVERY')
              GROUP BY order_stop_id, event_type HAVING count(*) > 1) THEN
    RAISE EXCEPTION '073: two live pallet rows of the same event on one stop exist - stop, show them to the owner';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '073: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;
  EXECUTE snap_sql INTO v_snap0;
  EXECUTE rel_sql INTO v_rel0;

  -- ===== PART 1: THE PALLET FEEDER (E11) =====
  CREATE FUNCTION public.plan_h_pallet_sync(p_legs bigint[], p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
declare
  -- "Aposyrthike apo ton programmatismo ethnikon" (the reason of a row the plan withdraws):
  w_reason constant text := convert_from(decode('zpHPgM6/z4PPjc+BzrjOt866zrUgzrHPgM+MIM+Ezr/OvSDPgM+Bzr/Os8+BzrHOvM68zrHPhM65z4POvM+MIM61zrjOvc65zrrPjs69', 'base64'), 'UTF8');
  v_leg bigint; w record; m pl_movements%rowtype; m2 pl_movements%rowtype; v_want jsonb; v_ev text; x jsonb; v_given int;
begin
  -- The ONE writer of pl_movements rows with piece_leg_id (F2 interface I-05): what a leg should have written is
  -- computed from the plan every time, and the leg's rows follow it. Pending rows follow; a confirmed row is history
  -- and is never rewritten (PALLETS_ARCHITECTURE 6) - it is withdrawn only when its leg goes (the caller listed it
  -- as pallets_confirmed and got the token, D-8). Nothing is ever deleted: a withdrawn row becomes 'reversed' with
  -- the reason (D-7: B-18b "the count never shrinks" stays true).
  for v_leg in select distinct u from unnest(p_legs) u where u is not null order by 1 loop
    select l.id, l.deleted_at is not null as dropped,
           (l.deleted_at is null and sp.deleted_at is null and vs.live and vs.kind = 'national' and vs.pallet_exchange)
             is true as feeds,
           sp.id as piece_id, sp.pallets, vs.client_id, vs.nat_from_location_id as nat_from,
           vs.nat_to_location_id as nat_to, pk.location_id as pick_loc,
           (pk.planned_to at time zone 'Europe/Athens')::date as pick_day,
           dr.location_id as drop_loc, (dr.planned_to at time zone 'Europe/Athens')::date as drop_day, hub.id as hub_id
      into w
      from piece_legs l
      join shipment_pieces sp on sp.id = l.piece_id
      join v_shipments vs on vs.shipment_id = sp.shipment_id
      join rt_stops pk on pk.id = l.pickup_stop_id
      join rt_stops dr on dr.id = l.drop_stop_id
      left join locations hub on hub.is_hub
     where l.id = v_leg;
    if w.id is null then continue; end if;
    -- cross-cutting input rule (coordinator 25/10, as 072's K1): NaN sorts above every number and +-Infinity passes
    -- the 071 CHECK pallets > 0; 'infinity' passes CHECK rt_stops_win. Either would reach the ledger (NaN as a raw
    -- 22003 at the integer cast, an endless day as movement_date 'infinity'). Refused by name before any write.
    if w.feeds and not (abs(w.pallets) < 'Infinity'::numeric) then
      perform plan_h_raise('bad_input', 'piece:' || w.piece_id || ':finite');
    end if;
    if w.feeds and not (isfinite(w.pick_day) and isfinite(w.drop_day)) then
      perform plan_h_raise('bad_input', 'leg:' || w.id || ':finite');
    end if;
    -- D-5: a national shipment with pallet exchange writes LOADING where its leg loads at the shipment's origin and
    -- DELIVERY where it unloads at the destination; nothing at the hub (locked case 6: our own hand-over). A VS bridge
    -- writes nothing here: its Greek stop is the international's, and the international feeders stay its one writer
    -- (D-6). DELIVERY is pending, prefilled taken = given (spec 3 Money: "the user only confirms").
    v_want := '{}'::jsonb;
    if w.feeds and w.pick_loc = w.nat_from and w.nat_from is distinct from w.hub_id then
      v_want := v_want || jsonb_build_object('LOADING', jsonb_build_object('location_id', w.pick_loc,
                  'movement_date', w.pick_day, 'taken', w.pallets, 'given', 0));
    end if;
    if w.feeds and w.drop_loc = w.nat_to and w.nat_to is distinct from w.hub_id then
      v_want := v_want || jsonb_build_object('DELIVERY', jsonb_build_object('location_id', w.drop_loc,
                  'movement_date', w.drop_day, 'taken', w.pallets, 'given', w.pallets));
    end if;
    -- D-10: the ledger counts whole pallets (pl_movements.taken is an integer); never rounded in silence
    if v_want <> '{}'::jsonb and w.pallets <> trunc(w.pallets) then
      perform plan_h_raise('pallet_fraction', 'piece:' || w.piece_id);
    end if;
    for m in select * from pl_movements where piece_leg_id = v_leg and status <> 'reversed' order by id for update loop
      x := v_want -> m.event_type;
      if x is not null then
        -- given belongs to the user once it differs from the prefill (spec 3: "the user only confirms, and corrects
        -- only if we did not get them back"): a later change of the leg moves the row, never undoes the correction.
        -- taken stays the plan's (the piece's pallets), as the browser feeder keeps a pending LOADING's taken today.
        v_given := case when m.given = (case m.event_type when 'DELIVERY' then m.taken else 0 end)
                        then (x->>'given')::numeric::int else m.given end;
        if m.status = 'pending'
           and (m.location_id, m.movement_date, m.taken, m.given, m.client_id, m.counterparty_type)
               is distinct from ((x->>'location_id')::bigint, (x->>'movement_date')::date, (x->>'taken')::numeric::int,
                                 v_given, w.client_id, 'CLIENT') then
          update pl_movements
             set location_id = (x->>'location_id')::bigint, movement_date = (x->>'movement_date')::date,
                 taken = (x->>'taken')::numeric::int, given = v_given,
                 counterparty_type = 'CLIENT', client_id = w.client_id, partner_id = null
           where id = m.id returning * into m2;
          perform plan_h_audit(p_actor, p_role, 'update', 'pl_movements', m.id::text, to_jsonb(m), to_jsonb(m2));
        end if;
        v_want := v_want - m.event_type;
      elsif m.status = 'pending' or w.dropped then
        update pl_movements set status = 'reversed', reason = w_reason || ' (' || p_actor || ')'
         where id = m.id returning * into m2;
        perform plan_h_audit(p_actor, p_role, 'update', 'pl_movements', m.id::text, to_jsonb(m), to_jsonb(m2));
      end if;
    end loop;
    for v_ev in select k from jsonb_object_keys(v_want) k order by 1 loop
      x := v_want -> v_ev;
      insert into pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given,
                                created_by, piece_leg_id)
      values ((x->>'movement_date')::date, 'CLIENT', w.client_id, (x->>'location_id')::bigint, v_ev,
              (x->>'taken')::numeric::int, (x->>'given')::numeric::int, p_actor, v_leg)
      returning * into m2;
      perform plan_h_audit(p_actor, p_role, 'create', 'pl_movements', m2.id::text, null, to_jsonb(m2));
    end loop;
  end loop;
end
$f$;

  -- ===== PART 2: 072's FUNCTIONS, ONE HOOK EACH (from the LIVE text; md5 before = PART 0, after = below) =====
  -- D-2: 073 does not rewrite 072; it adds one call (or one list branch) at a marked place, so the review of each
  -- change is one hunk and the rollback puts the 072 + 072b text (PART 0) back byte for byte.
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)',
       E'  -- F3 hook: the pallet feeder of this leg (pl_movements.piece_leg_id, 073) is written here.\n',
       E'  -- 073 (E11): the pallet feeder of this leg (pl_movements.piece_leg_id), in the same transaction.\n'
       || E'  perform plan_h_pallet_sync(array[l.id], p_actor, p_role);\n',
       '0d95758b35f6095d42b551c287e3008b'),
      ('public.plan_h_leg_drop(bigint,text,text,text)',
       E'  perform plan_h_audit(p_actor, p_role, ''delete'', ''piece_legs'', p_leg::text, to_jsonb(a), to_jsonb(b));\n',
       E'  perform plan_h_audit(p_actor, p_role, ''delete'', ''piece_legs'', p_leg::text, to_jsonb(a), to_jsonb(b));\n'
       || E'  -- 073 (E11): what this leg wrote in the pallet ledger is withdrawn with it (never deleted)\n'
       || E'  perform plan_h_pallet_sync(array[p_leg], p_actor, p_role);\n',
       'cb48e1aeba2d8e78191b9fc47eae6d67'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])',
       E'  for r in select distinct l.rt_id from piece_legs l\n',
       E'  -- 073 (E11, D-8): a confirmed pallet row of a leg that goes is withdrawn after the token - listed first\n'
       || E'  v := v || coalesce((select jsonb_agg(jsonb_build_object(''kind'', ''pallets_confirmed'', ''leg_id'', m.piece_leg_id,\n'
       || E'                                                         ''pl_movement_id'', m.id, ''event_type'', m.event_type,\n'
       || E'                                                         ''taken'', m.taken, ''given'', m.given))\n'
       || E'                        from pl_movements m join piece_legs l on l.id = m.piece_leg_id\n'
       || E'                       where l.id = any (p_legs) and l.deleted_at is null and m.status = ''confirmed''), ''[]''::jsonb);\n'
       || E'  for r in select distinct l.rt_id from piece_legs l\n',
       'e370e52c9dd96d7e4e152b3ce348736e'),
      ('public.plan_order_update(jsonb,text,text)',
       E'  perform plan_h_finish();\n  return plan_h_ok(''plan_order_update''',
       E'  -- 073 (E11): the pallet rows of this order''s legs follow the correction (pallets, pallet exchange)\n'
       || E'  perform plan_h_pallet_sync(array(select l.id from piece_legs l join shipment_pieces sp on sp.id = l.piece_id\n'
       || E'                                     join shipments sh on sh.id = sp.shipment_id\n'
       || E'                                    where sh.nat_order_id = n.id and l.deleted_at is null), p_actor, p_role);\n'
       || E'  perform plan_h_finish();\n  return plan_h_ok(''plan_order_update''',
       '114a6555848062a18b7f7fe8e57d70d6'),
      ('public.plan_rt_update(jsonb,text,text)',
       E'    -- 6. the international day follows the cycle that carries the first piece (decision 16)',
       E'    -- 073 (E11, flows gap 11): the pending pallet rows of the cycle follow its stop days\n'
       || E'    perform plan_h_pallet_sync(array(select l.id from piece_legs l where l.rt_id = v_rt and l.deleted_at is null),\n'
       || E'                               p_actor, p_role);\n'
       || E'    -- 6. the international day follows the cycle that carries the first piece (decision 16)',
       'be70612fb940356278c7c66705c8ee33')
    ) v(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF (length(v_src) - length(replace(v_src, v_g.a, ''))) <> length(v_g.a) THEN
      RAISE EXCEPTION '073: the hook place is not in % exactly once - stop', v_g.sig;
    END IF;
    v_new := replace(v_src, v_g.a, v_g.b);
    IF replace(v_new, v_g.b, v_g.a) <> v_src OR md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '073: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- pg_get_functiondef keeps everything else as it is (SECURITY, volatility, SET search_path, defaults); the
    -- function keeps its oid and its rights (CREATE OR REPLACE).
    v_def := pg_get_functiondef(to_regprocedure(v_g.sig));
    IF (length(v_def) - length(replace(v_def, v_src, ''))) <> length(v_src) THEN
      RAISE EXCEPTION '073: the body of % is not in its definition exactly once - stop', v_g.sig;
    END IF;
    EXECUTE replace(v_def, v_src, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) <> v_g.m THEN
      RAISE EXCEPTION '073 proof: % does not hold the generated text', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: THE VIEWS =====
  -- E7. The v5 share of every live leaf piece (spec 3 Money). Money: not security_invoker (like ct_v_rt_revenue, it
  -- reads ct_settings as its owner); SELECT only to service_role and the auditor's runner (PART 5).
  CREATE VIEW public.ct_v_v5_revenue AS
  WITH RECURSIVE anc AS (
    -- a leaf and every piece it came from (a piece splits only at the hub, 071 split_not_at_hub)
    SELECT ps.piece_id AS leaf_id, ps.piece_id FROM public.v_piece_state ps
    UNION ALL
    SELECT a.leaf_id, p.parent_piece_id FROM anc a JOIN public.shipment_pieces p ON p.id = a.piece_id
     WHERE p.parent_piece_id IS NOT NULL
  ), chain AS (
    -- every live leg that carried the leaf: its own and its ancestors', on a cycle that is not cancelled
    SELECT a.leaf_id, l.id AS leg_id, l.rt_id, l.drop_stop_id, pk.planned_from AS leg_at
      FROM anc a
      JOIN public.piece_legs l ON l.piece_id = a.piece_id AND l.deleted_at IS NULL
      JOIN public.ct_round_trips r ON r.id = l.rt_id AND r.status <> 'cancelled'
      JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
  ), leaf AS (
    -- what is shared: a national order's price; a VS order's X exactly as the international deducts it (034/057)
    SELECT ps.piece_id, ps.kind, ps.order_id, ps.nat_order_id, ps.pallets, ps.end_stop_id,
           CASE WHEN ps.kind = 'national' THEN 'price' ELSE 'x' END AS share_of,
           CASE WHEN ps.kind = 'national' THEN 'n' || ps.nat_order_id ELSE 'o' || ps.order_id END AS share_key,
           CASE WHEN ps.kind = 'national' THEN COALESCE(n.price, 0::numeric)
                ELSE public.stock_vs_charge(CASE WHEN o.direction = 'Export' THEN public.ct_setting('x_export')
                                                 ELSE public.ct_setting('x_import') END, vp.pallets) END AS total
      FROM public.v_piece_state ps
      LEFT JOIN public.national_orders n ON n.id = ps.nat_order_id
      LEFT JOIN public.orders o ON o.id = ps.order_id
      LEFT JOIN public.stock_v_pieces vp ON vp.piece_kind = 'intl' AND vp.piece_id = o.id
  ), share AS (
    -- spec 3: per pallet, over EVERY pallet of the order's live shipments, whatever the goods (IFCO is a client)
    SELECT lf.*,
           sum(lf.pallets) OVER (PARTITION BY lf.share_key ORDER BY lf.piece_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum,
           sum(lf.pallets) OVER (PARTITION BY lf.share_key) AS all_pallets
      FROM leaf lf
  ), leaf_amount AS (
    -- [M-3 ROUNDING] (beta, owner 24/10), as 057 stock_v_lot_alloc: running sums, so an order's shares add up to the cent
    SELECT s.*, round(s.total * s.cum / s.all_pallets, 2) - round(s.total * (s.cum - s.pallets) / s.all_pallets, 2) AS amount
      FROM share s
  ), pick AS (
    -- [M-1 WHICH CYCLE] (gamma, owner 24/10): the leaf's share split equally over every leg that carried it (running
    -- sums, so the parts add up to the leaf's share). A first cycle's revenue changes when the stock it left moves on
    -- (known and accepted, DECISION_LOG 24/10).
    SELECT c.leaf_id, c.leg_id, c.rt_id, 1::numeric AS w,
           row_number() OVER (PARTITION BY c.leaf_id ORDER BY c.leg_at, c.leg_id)::numeric AS w_cum,
           count(*) OVER (PARTITION BY c.leaf_id)::numeric AS w_all
      FROM chain c
  )
  -- one row per leaf and leg that carried it (M-1 gamma); a leaf no leg carried yet: one row, rt_id NULL = not
  -- assigned yet (waiting or stock)
  SELECT la.share_of AS kind, CASE WHEN la.kind <> 'national' THEN la.order_id END AS order_id, la.nat_order_id,
         la.piece_id, pk.leg_id, pk.rt_id, la.pallets, la.total,
         round(la.amount * COALESCE(pk.w_cum, 1::numeric) / COALESCE(pk.w_all, 1::numeric), 2)
           - round(la.amount * (COALESCE(pk.w_cum, 1::numeric) - COALESCE(pk.w, 1::numeric)) / COALESCE(pk.w_all, 1::numeric), 2) AS amount
    FROM leaf_amount la
    LEFT JOIN pick pk ON pk.leaf_id = la.piece_id;

  -- E7. Revenue per round trip: today's text, plus (a) no X through a Direct NL for a VS order that has a bridge
  -- (spec 2.2 "else X counts twice"), (b) [M-2 alpha] the international keeps today's whole X charge, bridge or not,
  -- (c) the v5 shares
  -- in revenue_natl. For every round trip without a v5 row the numbers are the old ones (proved in PART 5).
  CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS
  WITH natord_home AS (
         SELECT nord.id AS national_order_id,
            nord.price,
            COALESCE(( SELECT min(h1.id) AS min
                   FROM national_loads h1
                  WHERE h1.source_national_order_id = nord.id AND h1.deleted_at IS NULL), ( SELECT min(h2.id) AS min
                   FROM national_loads h2
                  WHERE h2.deleted_at IS NULL AND h2.source_cons_load_id = (( SELECT gl.cons_load_id
                           FROM groupage_lines gl
                          WHERE gl.national_order_id = nord.id AND gl.deleted_at IS NULL AND gl.cons_load_id IS NOT NULL
                          ORDER BY gl.id
                         LIMIT 1)))) AS home_nat_load_id
           FROM national_orders nord
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL
            -- a national order with v5 shipments earns through its shares only (ct_v_v5_revenue): its old home
            -- national load gives nothing more, or the price counts twice (as X, spec 2.2; B-78 names both)
            AND NOT (EXISTS ( SELECT 1
                   FROM shipments s5
                  WHERE s5.nat_order_id = nord.id AND s5.deleted_at IS NULL))
        ), legs AS (
         SELECT rt.id AS rt_id,
                CASE
                    WHEN l.order_id IS NOT NULL THEN COALESCE(sa.rt_amount, o.price,
                    CASE
                        WHEN o.leg_no = 1 THEN p.price
                        ELSE NULL::numeric
                    END, 0::numeric) -
                    CASE
                        WHEN
                        CASE
                            WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                            ELSE o.veroia_switch
                        END THEN
                        -- [M-2 THE INTERNATIONAL'S X] (alpha, owner 24/10): today's charge, bridge or not - the
                        -- international loses the whole X from registration; the national shares wait unassigned
                        stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                ELSE o.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, vp.pallets)
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS rev_intl,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN
                    CASE
                        WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL AND nl.id = (( SELECT min(d.id) AS min
                           FROM national_loads d
                          WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text AND d.deleted_at IS NULL)) AND
                        CASE
                            WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                            ELSE so.veroia_switch
                        END AND NOT (EXISTS ( SELECT 1
                           FROM shipments b
                          WHERE (b.order_id = so.id OR b.order_id = sp.id) AND b.deleted_at IS NULL)) THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                ELSE so.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, svp.pallets)
                        ELSE 0::numeric
                    END + COALESCE(( SELECT sum(h.price) AS sum
                       FROM natord_home h
                      WHERE h.home_nat_load_id = nl.id), 0::numeric)
                    ELSE 0::numeric
                END AS rev_natl
           FROM ct_round_trips rt
             LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN orders p ON p.id = o.parent_order_id
             LEFT JOIN stock_v_rt_amounts sa ON sa.order_id = o.id
             LEFT JOIN stock_v_pieces vp ON vp.piece_kind = 'intl'::text AND vp.piece_id = o.id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
             LEFT JOIN orders so ON so.id = nl.source_order_id
             LEFT JOIN orders sp ON sp.id = so.parent_order_id
             LEFT JOIN stock_v_pieces svp ON svp.piece_kind = 'intl'::text AND svp.piece_id = so.id
        ), v5 AS (
         SELECT x.rt_id,
            0::numeric AS rev_intl,
            x.amount AS rev_natl
           FROM ct_v_v5_revenue x
          WHERE x.rt_id IS NOT NULL
        ), allr AS (
         SELECT legs.rt_id, legs.rev_intl, legs.rev_natl FROM legs
        UNION ALL
         SELECT v5.rt_id, v5.rev_intl, v5.rev_natl FROM v5
        )
 SELECT rt_id,
    COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl
   FROM allr
  GROUP BY rt_id;

  -- E7. Costs: a v5 PARTNER cycle's planned rate is its one ct_round_trips.partner_rate (spec 3). Columns unchanged.
  CREATE OR REPLACE VIEW public.ct_v_rt_costs AS
  WITH lines AS (
         SELECT ct_cost_lines.rt_id,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category <> 'partner_rate'::text) AS net_other,
            sum(ct_cost_lines.vat) AS vat,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category = 'partner_rate'::text) AS partner_invoiced
           FROM ct_cost_lines
          WHERE ct_cost_lines.rt_id IS NOT NULL
          GROUP BY ct_cost_lines.rt_id
        ), carried AS (
         SELECT l.rt_id,
            o.id AS order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id
        UNION
         SELECT l.rt_id,
            s.id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.parent_order_id IS NOT NULL
             JOIN orders s ON s.parent_order_id = o.parent_order_id AND s.id <> o.id AND s.deleted_at IS NULL AND s.partner_id IS NOT NULL
          WHERE NOT (EXISTS ( SELECT 1
                   FROM ct_rt_legs l2
                     JOIN ct_round_trips r2 ON r2.id = l2.rt_id
                  WHERE l2.order_id = s.id AND r2.status <> 'cancelled'::text))
        ), planned AS (
         SELECT x.rt_id,
            sum(x.partner_rate) AS partner_planned
           FROM ( SELECT c.rt_id,
                    pa.partner_rate
                   FROM carried c
                     JOIN LATERAL ( SELECT pa_1.partner_rate
                           FROM partner_assignments pa_1
                          WHERE pa_1.order_id = c.order_id AND pa_1.deleted_at IS NULL AND pa_1.status <> 'Cancelled'::text
                          ORDER BY pa_1.id DESC
                         LIMIT 1) pa ON true
                UNION ALL
                 SELECT l.rt_id,
                    nl.partner_rate
                   FROM ct_rt_legs l
                     JOIN national_loads nl ON nl.id = l.nat_load_id
                  WHERE nl.deleted_at IS NULL AND COALESCE(nl.is_partner_trip, false) AND nl.partner_rate IS NOT NULL
                UNION ALL
                 SELECT r5.id,
                    r5.partner_rate
                   FROM ct_round_trips r5
                  WHERE r5.model = 2 AND r5.trip_type = 'PARTNER'::text AND r5.partner_rate IS NOT NULL) x
          GROUP BY x.rt_id
        )
 SELECT rt.id AS rt_id,
    COALESCE(li.net_other, 0::numeric) + COALESCE(NULLIF(li.partner_invoiced, 0::numeric), pl.partner_planned, 0::numeric) + COALESCE(dl.trip_value, 0::numeric) + COALESCE(dl.expenses, 0::numeric) AS lines_net,
    COALESCE(li.vat, 0::numeric) AS vat,
        CASE
            WHEN rt.trip_type = 'OWNED'::text AND rt.total_km IS NOT NULL THEN round(COALESCE(w.eur_per_km, ct_setting('wear_fallback_eur_km'::text)) * rt.total_km::numeric, 2)
            ELSE 0::numeric
        END AS wear,
    dl.trip_value AS dl_trip_value,
    dl.expenses AS dl_expenses,
    dl.id IS NOT NULL AND dl.trip_value IS NULL AS driver_pay_pending,
    rt.trip_type = 'OWNED'::text AND rt.driver_id IS NOT NULL AND dl.id IS NULL AS driver_pay_missing,
    COALESCE(pl.partner_planned, 0::numeric) AS partner_planned,
    COALESCE(li.partner_invoiced, 0::numeric) AS partner_invoiced
   FROM ct_round_trips rt
     LEFT JOIN lines li ON li.rt_id = rt.id
     LEFT JOIN planned pl ON pl.rt_id = rt.id
     LEFT JOIN dl_entries dl ON dl.rt_id = rt.id AND dl.deleted_at IS NULL
     LEFT JOIN ct_v_wear_rate w ON w.truck_id = rt.truck_id;

  -- E7 / D-4 (C-07). The P&L: today's columns, then partner_rate_missing - a v5 PARTNER trip whose rate was left
  -- empty and was not invoiced either: a pending item (spec 3), never a silent cost of 0 (principle 1).
  CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS
  SELECT rt.id,
    rt.code,
    rt.scope,
    rt.trip_type,
    rt.truck_id,
    rt.driver_id,
    rt.partner_id,
    rt.date_start,
    rt.date_end,
    rt.status,
    rt.total_km,
    r.revenue,
    c.lines_net + c.wear AS cost_net,
    c.vat AS cost_vat,
    c.lines_net + c.wear + c.vat AS cost_gross,
    r.revenue - (c.lines_net + c.wear + c.vat) AS profit_worst,
    r.revenue - (c.lines_net + c.wear) AS profit_ex_vat,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_worst_pct,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_ex_vat_pct,
    c.dl_trip_value,
    c.dl_expenses,
    c.driver_pay_pending,
    c.driver_pay_missing,
    c.partner_planned,
    c.partner_invoiced,
    r.revenue_intl,
    r.revenue_natl,
    rt.model = 2 AND rt.trip_type = 'PARTNER'::text AND rt.partner_rate IS NULL AND c.partner_invoiced = 0::numeric AS partner_rate_missing
   FROM ct_round_trips rt
     JOIN ct_v_rt_revenue r ON r.rt_id = rt.id
     JOIN ct_v_rt_costs c ON c.rt_id = rt.id
  WHERE rt.status <> 'cancelled'::text;

  -- E9. The route of a round trip: today's text for the legs of today, plus one block per side of a v5 cycle from
  -- its live stops (tech 3.3): KATHODOS before ANODOS, first and last stop of the side, "+N stops". A cancelled v5
  -- cycle has no live stop, so no route - as a v1 trip whose legs are gone (D-11). The Greek arrows are escapes.
  CREATE OR REPLACE VIEW public.dl_v_rt_route WITH (security_invoker = true) AS
  WITH leg AS (
         SELECT l.rt_id,
            l.id AS leg_id,
            l.direction,
            l.seq,
            COALESCE(o.loading_datetime::timestamp with time zone, nl.loading_datetime)::date AS load_d,
            COALESCE(o.actual_delivery_date, nl.actual_delivery_date, o.delivery_datetime, nl.delivery_datetime::date) AS deliv_d,
            COALESCE(o.loading_location_1_id, nl.pickup_location_1_id) AS from_id,
            COALESCE(o.unloading_location_10_id, o.unloading_location_9_id, o.unloading_location_8_id, o.unloading_location_7_id, o.unloading_location_6_id, o.unloading_location_5_id, o.unloading_location_4_id, o.unloading_location_3_id, o.unloading_location_2_id, o.unloading_location_1_id, nl.delivery_location_10_id, nl.delivery_location_9_id, nl.delivery_location_8_id, nl.delivery_location_7_id, nl.delivery_location_6_id, nl.delivery_location_5_id, nl.delivery_location_4_id, nl.delivery_location_3_id, nl.delivery_location_2_id, nl.delivery_location_1_id) AS to_id,
            ( SELECT count(*) AS count
                   FROM ( VALUES (o.loading_location_2_id), (o.loading_location_3_id), (o.loading_location_4_id), (o.loading_location_5_id), (o.loading_location_6_id), (o.loading_location_7_id), (o.loading_location_8_id), (o.loading_location_9_id), (o.loading_location_10_id), (o.unloading_location_2_id), (o.unloading_location_3_id), (o.unloading_location_4_id), (o.unloading_location_5_id), (o.unloading_location_6_id), (o.unloading_location_7_id), (o.unloading_location_8_id), (o.unloading_location_9_id), (o.unloading_location_10_id), (nl.pickup_location_2_id), (nl.pickup_location_3_id), (nl.pickup_location_4_id), (nl.pickup_location_5_id), (nl.pickup_location_6_id), (nl.pickup_location_7_id), (nl.pickup_location_8_id), (nl.pickup_location_9_id), (nl.pickup_location_10_id), (nl.delivery_location_2_id), (nl.delivery_location_3_id), (nl.delivery_location_4_id), (nl.delivery_location_5_id), (nl.delivery_location_6_id), (nl.delivery_location_7_id), (nl.delivery_location_8_id), (nl.delivery_location_9_id), (nl.delivery_location_10_id)) v(x)
                  WHERE v.x IS NOT NULL) AS extra_stops
           FROM ct_rt_legs l
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
        ), st AS (
         SELECT s.rt_id,
            s.side,
            s.location_id,
            s.planned_from,
            s.planned_to,
            row_number() OVER (PARTITION BY s.rt_id, s.side ORDER BY s.seq, s.id) AS rn_first,
            row_number() OVER (PARTITION BY s.rt_id, s.side ORDER BY s.seq DESC, s.id DESC) AS rn_last,
            count(*) OVER (PARTITION BY s.rt_id, s.side) AS n
           FROM rt_stops s
             JOIN ct_round_trips r ON r.id = s.rt_id
          WHERE s.deleted_at IS NULL AND r.model = 2
        ), side AS (
         SELECT f.rt_id,
            f.side,
            CASE f.side WHEN 'KATHODOS'::text THEN 1 ELSE 2 END AS ord,
            (f.planned_from AT TIME ZONE 'Europe/Athens'::text)::date AS load_d,
            (t.planned_to AT TIME ZONE 'Europe/Athens'::text)::date AS deliv_d,
            f.location_id AS from_id,
            t.location_id AS to_id,
            GREATEST(f.n - 2, 0::bigint) AS extra_stops
           FROM st f
             JOIN st t ON t.rt_id = f.rt_id AND t.side = f.side AND t.rn_last = 1
          WHERE f.rn_first = 1
        )
 SELECT leg.rt_id,
    string_agg((COALESCE(lf.city, lf.name) || U&' \2192 '::text) || COALESCE(lt.city, lt.name), U&' \00B7 '::text ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_text,
    jsonb_agg(jsonb_build_object('dir', leg.direction, 'load', leg.load_d, 'deliv', leg.deliv_d, 'from', jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country), 'to', jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country), 'extra_stops', leg.extra_stops) ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_legs
   FROM leg
     LEFT JOIN locations lf ON lf.id = leg.from_id
     LEFT JOIN locations lt ON lt.id = leg.to_id
  GROUP BY leg.rt_id
UNION ALL
 SELECT side.rt_id,
    string_agg((COALESCE(lf.city, lf.name) || U&' \2192 '::text) || COALESCE(lt.city, lt.name), U&' \00B7 '::text ORDER BY side.ord) AS route_text,
    jsonb_agg(jsonb_build_object('dir', side.side, 'load', side.load_d, 'deliv', side.deliv_d, 'from', jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country), 'to', jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country), 'extra_stops', side.extra_stops) ORDER BY side.ord) AS route_legs
   FROM side
     LEFT JOIN locations lf ON lf.id = side.from_id
     LEFT JOIN locations lt ON lt.id = side.to_id
  GROUP BY side.rt_id;

  -- E11 / D-12. The partner pallet gate (PALLETS_ARCHITECTURE 4.2): today's rows, plus every v5 cycle with legs of
  -- national shipments with pallet exchange; the sheet of a v5 leg = a confirmed pallet row of that leg.
  CREATE OR REPLACE VIEW public.ct_v_rt_pallet_gate WITH (security_invoker = true) AS
  WITH rt_orders AS (
         SELECT l.rt_id,
            l.order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
          WHERE l.order_id IS NOT NULL AND o.pallet_exchange = true
        ), sheets AS (
         SELECT DISTINCT pl_movements.order_id
           FROM pl_movements
          WHERE pl_movements.status = 'confirmed'::text AND (pl_movements.event_type = ANY (ARRAY['PARTNER_PICKUP'::text, 'PARTNER_DROPOFF'::text])) AND pl_movements.order_id IS NOT NULL
        ), v5 AS (
         SELECT l.rt_id,
            count(*) AS legs_needing_sheet,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM pl_movements m
                  WHERE m.piece_leg_id = l.id AND m.status = 'confirmed'::text))) AS legs_with_sheet
           FROM piece_legs l
             JOIN shipment_pieces sp ON sp.id = l.piece_id
             JOIN v_shipments vs ON vs.shipment_id = sp.shipment_id
             JOIN ct_round_trips r ON r.id = l.rt_id
          WHERE l.deleted_at IS NULL AND r.model = 2 AND r.status <> 'cancelled'::text AND vs.live AND vs.kind = 'national'::text AND vs.pallet_exchange
          GROUP BY l.rt_id
        )
 SELECT ro.rt_id,
    count(*) AS legs_needing_sheet,
    count(s.order_id) AS legs_with_sheet,
    count(*) = count(s.order_id) AS sheets_ok
   FROM rt_orders ro
     LEFT JOIN sheets s ON s.order_id = ro.order_id
  GROUP BY ro.rt_id
UNION ALL
 SELECT v5.rt_id,
    v5.legs_needing_sheet,
    v5.legs_with_sheet,
    v5.legs_needing_sheet = v5.legs_with_sheet AS sheets_ok
   FROM v5;

  -- E6 / D-3. Stock 057: a national lot piece that has v5 shipments is delivered when every piece of it executed
  -- (071 v_national_order_state, Athens day) and is on a truck when a live leg carries any of it. Without v5
  -- shipments: today's rule (K-01: two definitions of "delivered" until day L).
  CREATE OR REPLACE VIEW public.stock_v_pieces AS
  SELECT o.stock_lot_id AS lot_id,
    'intl'::text AS piece_kind,
    o.id AS piece_id,
    o.legacy_id AS piece_rec,
    o.client_id,
    o.loading_location_1_id AS pickup_location_id,
    order_pallets(o.*) AS pallets,
    o.status,
    o.loading_datetime AS loading_date,
    COALESCE(o.status = 'Delivered'::text, false) AS delivered,
        CASE
            WHEN o.status = 'Delivered'::text THEN COALESCE(o.actual_delivery_date, o.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
    o.truck_id IS NOT NULL OR o.partner_id IS NOT NULL AS on_truck,
    o.created_at
   FROM orders o
  WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NOT NULL
UNION ALL
 SELECT n.stock_lot_id AS lot_id,
    'natl'::text AS piece_kind,
    n.id AS piece_id,
    n.legacy_id AS piece_rec,
    n.client_id,
    n.pickup_location_1_id AS pickup_location_id,
    COALESCE(n.pallets, 0::numeric) AS pallets,
    n.status,
    n.loading_datetime AS loading_date,
        CASE
            WHEN v5.is_v5 THEN COALESCE(ns.executed, false)
            ELSE stock_natl_delivered(n.status, n.delivery_datetime)
        END AS delivered,
        CASE
            WHEN v5.is_v5 THEN
            CASE
                WHEN ns.executed THEN ( SELECT max(ps.end_day) AS max
                   FROM v_piece_state ps
                  WHERE ps.nat_order_id = n.id)
                ELSE NULL::date
            END
            WHEN stock_natl_delivered(n.status, n.delivery_datetime) THEN COALESCE(n.actual_delivery_date, n.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
        CASE
            WHEN v5.is_v5 THEN (EXISTS ( SELECT 1
               FROM piece_legs l
                 JOIN shipment_pieces sp ON sp.id = l.piece_id
                 JOIN shipments sh ON sh.id = sp.shipment_id
                 JOIN ct_round_trips r ON r.id = l.rt_id
              WHERE sh.nat_order_id = n.id AND sh.deleted_at IS NULL AND l.deleted_at IS NULL AND r.status <> 'cancelled'::text))
            ELSE n.truck_id IS NOT NULL OR n.partner_id IS NOT NULL
        END AS on_truck,
    n.created_at
   FROM national_orders n
     CROSS JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
               FROM shipments s
              WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)) AS is_v5) v5
     LEFT JOIN v_national_order_state ns ON ns.nat_order_id = n.id
  WHERE n.deleted_at IS NULL AND n.stock_lot_id IS NOT NULL;

  -- ===== PART 4: ONE WRITER PER INTERNATIONAL STOP (D-9, spec 5 E11 "the double DELIVERY of plOnDelivered") =====
  -- The browser feeders write GET-then-POST and pl_mov_stop is a plain index: two calls at the same moment (two
  -- users, or plOnDelivered from the day page and from the late page) write two DELIVERY rows on one stop and the
  -- client's balance doubles. The base refuses the second (23505); reversed rows do not count (a reversal and its
  -- replacement live side by side). D-9 NARROW (25/10): only the two events the feeders write, LOADING and DELIVERY;
  -- two live ADJUSTMENT / RETURN rows on one stop stay possible (the index changes what a role may write, so as
  -- little as catches the double row). Measured 23/10 and 26/10: 0 such pairs.
  CREATE UNIQUE INDEX pl_mov_stop_once ON public.pl_movements (order_stop_id, event_type)
    WHERE order_stop_id IS NOT NULL AND status <> 'reversed' AND event_type IN ('LOADING', 'DELIVERY');

  -- ===== PART 5: RIGHTS AND PROOFS =====
  REVOKE ALL ON FUNCTION public.plan_h_pallet_sync(bigint[],text,text) FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON public.ct_v_v5_revenue FROM PUBLIC, anon, authenticated, service_role, tms_reader;
  GRANT SELECT ON public.ct_v_v5_revenue TO service_role, tms_check_runner;

  -- the numbers of today: every view, row for row, the same as before (0 v5 rows: no branch above has a row)
  EXECUTE snap_sql INTO v_snap1;
  IF v_snap1 <> v_snap0 THEN
    RAISE EXCEPTION '073 proof: a number of today changed (% -> %)', v_snap0, v_snap1;
  END IF;
  EXECUTE rel_sql INTO v_rel1;
  IF v_rel1 <> v_rel0 THEN
    RAISE EXCEPTION '073 proof: the options or rights of a replaced view changed (% -> %)', v_rel0, v_rel1;
  END IF;
  -- the new texts are the ones of the plan (md5 of pg_get_viewdef(oid, true), measured with tms-auditor/test/tools/
  -- md5-073.mjs on the production-shaped PGlite 17 copy = production 17; M-1 gamma, M-2 alpha, M-3 beta)
  FOR v_g IN SELECT * FROM (VALUES
      ('public.ct_v_v5_revenue', 'c9dc289ac9effdcff38a5a4847ca3e70'),
      ('public.ct_v_rt_revenue', 'ad3c2b619ee826b3c8250a07011807da'),
      ('public.ct_v_rt_costs', 'ffd8d8191117b0833fb656faa10d3fa2'),
      ('public.ct_v_rt_pnl', '26e49204998a386c22f45ebf1746b177'),
      ('public.dl_v_rt_route', 'b21405a7856b912d2ea697235461cbd6'),
      ('public.ct_v_rt_pallet_gate', '92daf0df9d41c2028880fac7be0167c5'),
      ('public.stock_v_pieces', 'db95036d7dcc8cb02d32843ee0b2fb7c')
    ) g(rel, m) LOOP
    IF md5(pg_get_viewdef(to_regclass(v_g.rel), true)) <> v_g.m THEN
      RAISE EXCEPTION '073 proof: view % has md5 %, the plan says %', v_g.rel, md5(pg_get_viewdef(to_regclass(v_g.rel), true)), v_g.m;
    END IF;
  END LOOP;
  -- born closed: the helper runs as its caller and nobody but its owner calls it; the money view is not open to
  -- the API roles nor to tms_reader ("tms_reader: no money", 057)
  IF has_function_privilege('anon', 'public.plan_h_pallet_sync(bigint[],text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.plan_h_pallet_sync(bigint[],text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.plan_h_pallet_sync(bigint[],text,text)', 'EXECUTE')
     OR (SELECT prosecdef OR pg_get_userbyid(proowner) <> 'postgres' OR proconfig IS DISTINCT FROM ARRAY['search_path=public']
           FROM pg_proc WHERE oid = 'public.plan_h_pallet_sync(bigint[],text,text)'::regprocedure) THEN
    RAISE EXCEPTION '073 proof: plan_h_pallet_sync is open, SECURITY DEFINER, not owned by postgres or without search_path';
  END IF;
  IF has_table_privilege('anon', 'public.ct_v_v5_revenue', 'SELECT') OR has_table_privilege('authenticated', 'public.ct_v_v5_revenue', 'SELECT')
     OR has_table_privilege('tms_reader', 'public.ct_v_v5_revenue', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.ct_v_v5_revenue', 'SELECT')
     OR NOT has_table_privilege('tms_check_runner', 'public.ct_v_v5_revenue', 'SELECT') THEN
    RAISE EXCEPTION '073 proof: ct_v_v5_revenue rights are not service_role + tms_check_runner only';
  END IF;
  -- the public functions of 072 (16) and 072b (+ plan_seg_change, plan_seg_fix, plan_seg_remove) are still exactly the
  -- 19 that service_role executes (073 adds a closed helper only)
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 19 THEN
    RAISE EXCEPTION '073 proof: service_role does not execute exactly the 19 public plan_* of 072 + 072b';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR v_trg1 IS DISTINCT FROM (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') THEN
    RAISE EXCEPTION '073 proof: triggers % -> %, B-54 % (073 adds no trigger)', v_trg0, v_trg1,
      (SELECT red_value FROM monitoring.checks WHERE id = 'B-54');
  END IF;
  -- PostgREST learns the new column of ct_v_rt_pnl now (GET /costs/pnl selects *)
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '073 OK: 7 views (1 new), 1 helper, 5 hooks in 072, 1 index; numbers of today unchanged (%); triggers %',
    v_snap1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NOT NULL
             AND to_regclass('public.ct_v_v5_revenue') IS NOT NULL AND to_regclass('public.pl_mov_stop_once') IS NOT NULL
            THEN '073 OK' ELSE '073 NOT APPLIED' END AS result,
       md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) AS revenue_md5,
       md5(pg_get_viewdef('public.dl_v_rt_route'::regclass, true)) AS route_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)'::regprocedure) AS leg_add_md5,
       (SELECT count(*) FROM public.ct_v_rt_pnl) AS pnl_rows,
       (SELECT count(*) FROM public.dl_v_rt_route) AS route_rows,
       (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
         + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices)
         + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL) AS v5_rows;
