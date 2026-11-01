-- 092 - NATIONAL v5: THE NATIONAL DESK SETS THE PALLETS AND THE VEROIA DAY OF A VS, THE INTERNATIONAL FOLLOWS (F45).
-- Owner 1/11, option (a); owner 11/10: one synced VS date, the national desk writes the international.
-- Found in the owner's real-user entry of W44 (31/10-1/11): VS 610 - the international says 24 pallets, 22 were loaded;
--   VS 630 - Excel Sun 1/11, international Mon 2/11; FAGE 644 - Excel Tue 3/11, international Wed 4/11. The
--   dispatcher's Excel is the truth for VS days.
-- WHAT WAS THERE (SELECT 1/11): the DAY already goes national -> international: plan_vs_set_day (072, POST
--   /plan/vs/day, the leg form's button "set the day") writes orders.cross_dock_date with plan.writer = 'natl' (the bridge
--   trigger then never unplans), its audit row and one notice to the international desk (used 30/10 on 607, 31/10 on
--   610). The PALLETS had no national path: one number lives in four places - the bridge's order stop
--   (order_stops.pallets), the order's loading_pallets_N / unloading_pallets_N of that stop (what the Weekly
--   International sums: order_pallets()), the Cross-dock stop (the international form writes it as the sum of the
--   loadings) and the national pieces (shipment_pieces.pallets, whose leaves sum to the stop: 071 pieces_sum).
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; the LIVE texts of plan_vs_set_day and plan_vs_state (patched) and of plan_h_vs_day and
--           plan_h_bridge_recut (called / relied on, NOT patched: recut returns at once when the leaves equal the stop)
--           = production 1/11 (md5 of prosrc, SELECT 1/11; none of the open drafts 083-091 touches any of the four);
--           B-54 = the enabled triggers
--   PART 1  plan_vs_set_day = live text + 5 hunks: the body may carry piece_id + pallets (the pallets of ONE VS piece
--           the dispatcher sees on a truck or waiting), with or without day; at least one of the two. The pallets go,
--           in this one transaction and with plan.writer = 'natl': the piece; the bridge's order stop (+delta, so the
--           leaves still sum to it); the order's {loading|unloading}_pallets_N of that stop (= the stop); for a loading,
--           the Cross-dock stop (+delta). One audit row per row changed (before -> after, by 'national desk (092)'),
--           ONE notice to the international desk (vs_pallets_set, the stop's numbers). The bridge trigger then finds
--           leaves = stop and recut does nothing: no loop, no notice of the national desk to itself. Allowed after
--           the loading too (owner 31/10: light rules with a trace) - that is when the real count is known. The same
--           number again changes nothing and tells nobody. A body with day only is the 072 call as it was.
--   PART 2  plan_vs_state = live text + 1 hunk: each VS answers its cross_dock_date too, so the national board shows a
--           truck that is at Veroia on another day than the VS (coordinator 1/11: never two numbers in silence).
--   PART 3  proofs, NOTICE "092 OK: ..."
-- No table, no column, no trigger, no grant. No Worker change: /plan/vs/day passes its body as p (PLAN_ROUTES) and
-- every role has "vs-day": POST; /plan/vs-state passes the new key through.
-- ORDER: after 088 (the chain 083 ... 088 touches none of these four texts; any order among them works, the owner's
-- order is kept). RUN: after 15:00 or with the owner's explicit yes: 092_plan_vs_pallets_day_dryrun.sql, then this
-- file, then 092_plan_vs_pallets_day_verify.sql. REVERSE: 092_plan_vs_pallets_day_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  d_1a CONSTANT text := $h$  v_order bigint; v_day date; o orders%rowtype; v_nid bigint; v_warn jsonb;
$h$;
  d_1b CONSTANT text := $h$  v_order bigint; v_day date; o orders%rowtype; v_nid bigint; v_warn jsonb;
  -- 092: the pallets of one VS piece (F45, owner 1/11 option a)
  v_piece bigint; v_pal numeric; v_sid bigint; v_st order_stops%rowtype; v_old numeric; v_new numeric;
  v_col text; v_ocol numeric; v_place text; v_pid bigint; v_warn2 jsonb := '[]'::jsonb; x record;
$h$;
  d_2a CONSTANT text := $h$  perform plan_h_keys(p, array['order_id', 'day'], 'p');
  -- coordinator 25/10 (cross-cutting input rule): an order_id of 'NaN' / '+-Infinity' is refused by this cast itself
  -- (a bigint has no non-finite value), as bad_input 'order_id or day' - never through numeric (a raw 0A000)
$h$;
  d_2b CONSTANT text := $h$  -- 092: piece_id + pallets set the pallets of one VS piece; the day and the pallets may come together
  perform plan_h_keys(p, array['order_id', 'day', 'piece_id', 'pallets'], 'p');
  -- coordinator 25/10 (cross-cutting input rule): an id of 'NaN' / '+-Infinity' is refused by its cast itself (a
  -- bigint has no non-finite value), as bad_input - never through numeric (a raw 0A000)
$h$;
  d_3a CONSTANT text := $h$    v_day := (p->>'day')::date;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
                 or datetime_field_overflow then
    perform plan_h_raise('bad_input', 'order_id or day');
  end;
  if v_order is null or v_day is null then perform plan_h_raise('bad_input', 'order_id and day'); end if;
$h$;
  d_3b CONSTANT text := $h$    v_day := (p->>'day')::date;
    v_piece := (p->>'piece_id')::bigint;
    v_pal := (p->>'pallets')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
                 or datetime_field_overflow then
    perform plan_h_raise('bad_input', 'order_id, day, piece_id or pallets');
  end;
  -- 092: the day is no longer required when the body sets pallets; a body with neither is refused as before
  if v_order is null or (v_day is null and v_piece is null) then perform plan_h_raise('bad_input', 'order_id and day'); end if;
  if (v_piece is null) <> (v_pal is null) then perform plan_h_raise('bad_input', 'piece_id and pallets'); end if;
  -- a count of pallets is positive, with one decimal at most and below 100000: the pieces are numeric(6,1), so 2.55
  -- would be rounded on the piece and not on the stop (pieces_sum at COMMIT), and 1e6 would overflow (a raw 22003).
  -- 'NaN' (it sorts above every number) and 'Infinity' are numeric input: both are refused here too.
  if v_pal is not null and not (v_pal > 0 and v_pal < 100000 and v_pal = round(v_pal, 1)) then
    perform plan_h_raise('bad_input', 'pallets:positive');
  end if;
$h$;
  d_4a CONSTANT text := $h$  v_nid := plan_h_vs_day(v_order, v_day, p_actor, p_role);
  perform plan_h_finish();
$h$;
  d_4b CONSTANT text := $h$  if v_day is not null then v_nid := plan_h_vs_day(v_order, v_day, p_actor, p_role); end if;
  if v_piece is not null then
    -- 092 (F45, owner 1/11 option a): VS 610 - the international said 24, the truck loaded 22, and the dispatcher
    -- could not say so from the Weekly. The piece the dispatcher sees, the bridge's order stop (+delta: 071's
    -- pieces_sum keeps the leaves equal to it), the order's column of that stop and, for a loading, the Cross-dock stop
    -- follow in this one transaction. plan.writer = 'natl' as plan_h_vs_day: the bridge trigger that runs on the stop
    -- then finds leaves = stop, so plan_h_bridge_recut returns at once (no second writer, no notice of the national
    -- desk to itself). The stop is locked before the piece, the order the international's save and recut use.
    select ps.order_stop_id into v_sid from v_piece_state ps
     where ps.piece_id = v_piece and ps.order_id = v_order and ps.order_stop_id is not null;
    if v_sid is null then perform plan_h_raise('bad_input', 'piece_id:' || v_piece); end if;
    select * into v_st from order_stops where id = v_sid and deleted_at is null for no key update;
    perform 1 from shipment_pieces where id = v_piece for no key update;
    select ps.pallets into v_old from v_piece_state ps where ps.piece_id = v_piece and ps.order_stop_id = v_sid;
    if v_st.id is null or v_old is null then perform plan_h_raise('bad_input', 'piece_id:' || v_piece); end if;
    if v_old <> v_pal then
      v_new := coalesce(v_st.pallets, 0) + (v_pal - v_old);
      perform set_config('plan.writer', 'natl', true);
      update shipment_pieces set pallets = v_pal where id = v_piece;
      perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', v_piece::text,
                           jsonb_build_object('pallets', v_old), jsonb_build_object('pallets', v_pal, 'by', 'national desk (092)'));
      update order_stops set pallets = v_new where id = v_st.id;
      perform plan_h_audit(p_actor, p_role, 'update', 'order_stops', v_st.id::text, jsonb_build_object('pallets', v_st.pallets),
                           jsonb_build_object('pallets', v_new, 'order_id', v_order, 'by', 'national desk (092)'));
      -- the order's own column of this stop (loading_pallets_N / unloading_pallets_N, N = stop_number: equal on all
      -- 193 VS stops of the last 60 days, SELECT 1/11): the Weekly International and its totals read these
      if v_st.stop_type in ('Loading', 'Unloading') and v_st.stop_number between 1 and 10
         and v_st.stop_number = trunc(v_st.stop_number) then
        v_col := lower(v_st.stop_type) || '_pallets_' || v_st.stop_number::int;
        execute format('select %I from orders where id = $1', v_col) into v_ocol using v_order;
        if v_ocol is distinct from v_new then
          execute format('update orders set %I = $1 where id = $2', v_col) using v_new, v_order;
          perform plan_h_audit(p_actor, p_role, 'update', 'orders', coalesce(o.legacy_id, o.id::text),
                               jsonb_build_object(v_col, v_ocol), jsonb_build_object(v_col, v_new, 'by', 'national desk (092)'));
        end if;
      else
        -- never a silent skip (principle 1): the answer says the order's column was not found
        v_warn2 := v_warn2 || jsonb_build_object('code', 'vs_order_column_missing', 'order_stop_id', v_st.id);
      end if;
      -- the Cross-dock stop is the sum of the loadings (the international form writes it so): it follows a loading
      if v_st.stop_type = 'Loading' then
        for x in update order_stops c set pallets = c.pallets + (v_pal - v_old) from order_stops c0
                  where c0.id = c.id and c.order_id = v_order and c.stop_type = 'Cross-dock' and c.deleted_at is null
                    and c.pallets is not null
                  returning c.id, c0.pallets as before, c.pallets as after loop
          perform plan_h_audit(p_actor, p_role, 'update', 'order_stops', x.id::text, jsonb_build_object('pallets', x.before),
                               jsonb_build_object('pallets', x.after, 'order_id', v_order, 'by', 'national desk (092)'));
        end loop;
      end if;
      select lo.name into v_place from locations lo where lo.id = v_st.location_id;
      -- the stop's numbers, as the international sees them (a split piece is a part of the stop)
      v_pid := plan_h_notice('intl', 'vs_pallets_set',
        case when v_st.stop_type = 'Loading'
          -- "To Ethnikon allaxe tis paletes tis diethnous %s, fortosi %s: %s -> %s . elegxe tis paradoseis"
          then 'zqTOvyDOlc64zr3Ouc66z47OvSDOrM67zrvOsc6+zrUgz4TOuc+CIM+AzrHOu86tz4TOtc+CIM+EzrfPgiDOtM65zrXOuM69zr/Pjc+CICVzLCDPhs+Mz4HPhM+Jz4POtyAlczogJXMg4oaSICVzIMK3IM6tzrvOtc6zzr7OtSDPhM65z4Igz4DOsc+BzrHOtM+Mz4POtc65z4I='
          -- "To Ethnikon allaxe tis paletes tis diethnous %s, paradosi %s: %s -> %s . elegxe ti fortosi" (an import: the
          -- loading abroad and the Weekly International's total stay as the international wrote them, code review xhigh)
          else 'zqTOvyDOlc64zr3Ouc66z47OvSDOrM67zrvOsc6+zrUgz4TOuc+CIM+AzrHOu86tz4TOtc+CIM+EzrfPgiDOtM65zrXOuM69zr/Pjc+CICVzLCDPgM6xz4HOrM60zr/Pg863ICVzOiAlcyDihpIgJXMgwrcgzq3Ou861zrPOvs61IM+Ezrcgz4bPjM+Bz4TPic+Dzrc=' end,
        array[coalesce(o.reference, o.id::text), coalesce(nullif(btrim(v_place), ''), '-'),
              coalesce(trim_scale(v_st.pallets)::text, '-'), trim_scale(v_new)::text],
        v_order, null, null, p_actor, p_role);
    end if;
  end if;
  perform plan_h_finish();
$h$;
  d_5a CONSTANT text := $h$     and v.first_hub_day is not null;
  return jsonb_build_object('ok', true, 'op', 'plan_vs_set_day', 'dry_run', false,
    'ids', jsonb_build_object('order_id', v_order), 'warnings', v_warn,
    'notice_ids', case when v_nid is null then '[]'::jsonb else jsonb_build_array(v_nid) end);
$h$;
  d_5b CONSTANT text := $h$     and v.first_hub_day is not null and v_day is not null;   -- 092: only a call that set the day
  return jsonb_build_object('ok', true, 'op', 'plan_vs_set_day', 'dry_run', false,
    'ids', jsonb_build_object('order_id', v_order)
           || case when v_piece is null then '{}'::jsonb else jsonb_build_object('piece_id', v_piece) end,
    'warnings', v_warn || v_warn2,
    'notice_ids', to_jsonb(array_remove(array[v_nid, v_pid], null)));
$h$;
  s_1a CONSTANT text := $h$                      'first_hub_day', v.first_hub_day, 'n_pieces', v.n_pieces)
$h$;
  s_1b CONSTANT text := $h$                      'first_hub_day', v.first_hub_day, 'n_pieces', v.n_pieces,
                      -- 092: the international's Veroia day, so the national board shows a truck that is at Veroia
                      -- on another day than the VS (coordinator 1/11: never two numbers in silence)
                      'cross_dock_date', (select o2.cross_dock_date from orders o2 where o2.id = o))
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '092: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_vs_set_day(jsonb,text,text)', 'c89e5533d8e9f5d0fcfeefcc2674c353'),
      ('public.plan_vs_state(bigint[])', '99175b659207c5019f1599ed389f1895'),
      ('public.plan_h_vs_day(bigint,date,text,text)', 'f9620e4c49fd4e96ab1513e91a529ae7'),
      ('public.plan_h_bridge_recut(bigint,text,text,text)', '53a6022f8f851641de134cdcf1462d55')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '092: % is not its live text of 1/11 (092 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '092: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1 + PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_vs_set_day(jsonb,text,text)', ARRAY[d_1a, d_2a, d_3a, d_4a, d_5a], ARRAY[d_1b, d_2b, d_3b, d_4b, d_5b], '843ddcb55a0812b015b5cd14c298a11a'),
      ('public.plan_vs_state(bigint[])', ARRAY[s_1a], ARRAY[s_1b], '4decce12c3ca9b3ebd30a7a6b3447d5d')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '092: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '092: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '092: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '092 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '092 proof: triggers % -> % (092 adds none)', v_trg0, v_trg1; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_bridge_recut(bigint,text,text,text)'::regprocedure)
     <> '53a6022f8f851641de134cdcf1462d55' THEN
    RAISE EXCEPTION '092 proof: plan_h_bridge_recut changed (092 never patches it)';
  END IF;
  RAISE NOTICE '092 OK: plan_vs_set_day sets the pallets of a VS piece (the international follows), plan_vs_state answers cross_dock_date, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_vs_set_day(jsonb,text,text)'::regprocedure) AS set_day_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_vs_state(bigint[])'::regprocedure) AS vs_state_md5;
