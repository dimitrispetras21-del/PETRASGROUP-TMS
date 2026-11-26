-- 114 - NATIONAL v5: A WAITING LOAD SPLITS AT ITS OWN LOADING POINT (owner 8/11 "first a split", again 25/11).
-- Plan docs/national-v5/2026-11-08-vs-split-at-loading-plan.md (its header = the decision; option A of its body is NOT
-- the one chosen). In two weeks of real planning the dispatcher needed at least 5 times to load the pallets of ONE
-- loading point on two trucks (e.g. 16 -> 3 + 13); only Veroia stock (and, since 098, a transfer stop) could split.
-- DRAFT. Never run by an agent. Run by the owner after 15:00 with his explicit yes: the dry run, this file, verify.
--
-- WHAT WAS THERE (SELECT 25/11, every md5 below measured on production that day and equal on the production-shaped
-- PGlite copy): plan_split_piece refused not_at_hub unless the piece was at Veroia or at a transfer stop (098 p_1b);
-- a part with no target got leave_by = nat_due_day - 1. plan_shipment_problem refused split_not_at_hub for a split
-- piece away from those two places (098 s_1b). v_piece_state.is_stock = a child with no leg of its own, wherever it
-- stands. Production holds 0 child pieces (25/11), so no row reads otherwise after 114.
-- NOW:
--   * a piece that WAITS AT ITS NATIONAL START - no live leg of its own nor of a parent (v_piece_pos.eff_last_leg_id
--     IS NULL) - splits there: parts only, no target, no stops, no leave_by (the parts wait as the load did, each
--     its own "PROS ANATHESI" line, assigned later as today). A piece that already rides is refused as before
--     (not_at_hub). Veroia and transfer-stop splits are unchanged.
--   * split_not_at_hub accepts the same: a split piece that never rode.
--   * is_stock: a child with no leg of its own that a truck brought (eff_last_leg_id IS NOT NULL) or that stands at
--     Veroia. A part of a split at the loading point is NOT stock: it is a waiting load, and its first ride moves
--     the international's day (decision 16) as the whole load would have.
--   * plan_board's waiting[] says parent_piece_id: the screen gives a part its own line and assigns it alone (a
--     group put would take its sibling too). The key is also how the screen knows 114 is live.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; the LIVE texts of plan_split_piece, plan_shipment_problem, plan_board, plan_h_put (it
--           reads is_stock) and of v_piece_state = production 25/11; counts before (shipments with a rule problem,
--           every piece's is_stock, this week's board)
--   PART 1  v_piece_state: CREATE OR REPLACE VIEW, one expression changed (oid, grants, security_invoker kept)
--   PART 2  live text + hunks: plan_split_piece, plan_shipment_problem, plan_board, each md5-proven, rights kept
--   PART 3  proofs: no piece changed its is_stock; every live shipment judged as before; this week's board is the
--           same once parent_piece_id is taken out; triggers unchanged; NOTICE "114 OK: ..."
-- No table, column, trigger, grant; no row written. No Worker change: POST /plan/pieces/split and GET /plan/board
-- forward the body and the answer as they are. The Worker's word for not_at_hub ("only at Veroia") stays true for
-- a load that already rides; the screen offers the split only where 114 allows it.
-- ORDER: after 112 (executed 8/11). RUN: 114_plan_split_at_loading_dryrun.sql, then this file, then
-- 114_plan_split_at_loading_verify.sql. REVERSE: 114_plan_split_at_loading_rollback.sql (everything back while no load
-- was split at its loading point; once one was, only new such splits are closed - its parent stays split for good,
-- and the rule that keeps its parts right stays).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  p_1a CONSTANT text := $h$  v_ans jsonb;
begin
$h$;
  p_1b CONSTANT text := $h$  v_ans jsonb;
  v_start boolean := false;
begin
$h$;
  p_2a CONSTANT text := $h$  if ps.position_location_id is distinct from v_hub
     and not exists (select 1 from rt_stops ts where ts.id = ps.last_drop_stop_id and ts.transfer_reason is not null
                       and ts.deleted_at is null) then
    perform plan_h_raise('not_at_hub', p0.id::text);
  end if;
$h$;
  p_2b CONSTANT text := $h$  -- 114 (owner 8/11, 25/11): or at its national start, while no truck took it or a parent of it (a load
  -- waiting at its loading point). Its parts only wait there: no target, no stops, no leave_by.
  v_start := ps.position_location_id is distinct from v_hub
     and not exists (select 1 from v_piece_pos pp where pp.piece_id = p0.id and pp.eff_last_leg_id is not null);
  if ps.position_location_id is distinct from v_hub and not v_start
     and not exists (select 1 from rt_stops ts where ts.id = ps.last_drop_stop_id and ts.transfer_reason is not null
                       and ts.deleted_at is null) then
    perform plan_h_raise('not_at_hub', p0.id::text);
  end if;
$h$;
  p_3a CONSTANT text := $h$    perform plan_h_keys(part, array['pallets', 'target', 'stops', 'leave_by'], 'part');
$h$;
  p_3b CONSTANT text := $h$    perform plan_h_keys(part, array['pallets', 'target', 'stops', 'leave_by'], 'part');
    -- 114: a part split at the loading point waits as the load did (owner: parts first, a truck each later)
    if v_start and (part ? 'target' or part ? 'stops' or part ? 'leave_by') then
      perform plan_h_raise('bad_input', 'part at the loading point: pallets only');
    end if;
$h$;
  p_4a CONSTANT text := $h$                 else ps.nat_due_day - 1 end, p_actor)
$h$;
  p_4b CONSTANT text := $h$                 when v_start then null else ps.nat_due_day - 1 end, p_actor)
$h$;
  s_1a CONSTANT text := $h$   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id
$h$;
  s_1b CONSTANT text := $h$   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id
     -- 114 (owner 8/11): or at its national start, never taken by a truck (split at its loading point)
     and pp.eff_last_leg_id is not null
$h$;
  b_1a CONSTANT text := $h$               'is_stock', ps.is_stock, 'client_id', vs.client_id, 'client', cl.company_name, 'reference', vs.reference,
$h$;
  b_1b CONSTANT text := $h$               'is_stock', ps.is_stock, 'client_id', vs.client_id, 'client', cl.company_name, 'reference', vs.reference,
               -- 114: a part of a split (its own line on the screen, assigned alone)
               'parent_piece_id', ps.parent_piece_id,
$h$;
  m_view_old CONSTANT text := '598fd9472beaef97adaf49b1ff431504';
  m_view_new CONSTANT text := 'ac9c5c6dae30a2d56dfc07dee6ac0af3';
  v_g record; v_h record; v_new text; p pg_proc%rowtype; v_lang text; v_week date;
  v_trg0 int; v_trg1 int; v_bad0 int; v_bad1 int; v_sh int; v_st0 text; v_st1 text; v_b0 text; v_b1 text; v_pc int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '10min', true);   -- the proofs read this week's board

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '114: day L is not set (074 / 079) - stop';
  END IF;
  IF md5(pg_get_viewdef('public.v_piece_state'::regclass, true)) = m_view_new THEN
    RAISE EXCEPTION '114 has run, nothing to do: run 114_plan_split_at_loading_verify.sql instead';
  END IF;
  IF md5(pg_get_viewdef('public.v_piece_state'::regclass, true)) <> m_view_old THEN
    RAISE EXCEPTION '114: v_piece_state is not 071''s view (md5 %) - stop', md5(pg_get_viewdef('public.v_piece_state'::regclass, true));
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      -- patched below (production 25/11, after 098 / 099 / 112)
      ('public.plan_split_piece(jsonb,text,text)', 'f1993aeb0344b24e8abad84d8f92603d'),
      ('public.plan_shipment_problem(bigint)', '6afcc505725de48444c04deb770f72c4'),
      ('public.plan_board(date,text)', '6ee19458d60e62de1492fa72edec36c8'),
      -- relied on, not patched: it reads is_stock (take_pallets, the international's day of a first ride)
      ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', '3b86b9a173e94a7cd45bb4fb53d9b387')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '114: % is not the text 114 builds on (md5 %; already applied, or changed since) - stop', v_g.sig,
        (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig));
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT count(*), count(*) FILTER (WHERE public.plan_shipment_problem(s.id) IS NOT NULL) INTO v_sh, v_bad0
    FROM public.shipments s WHERE s.deleted_at IS NULL;
  -- every piece's is_stock, and this week's board (the board's week starts on a Saturday, Athens)
  SELECT md5(coalesce(string_agg(ps.piece_id || ':' || ps.is_stock, '|' ORDER BY ps.piece_id), '')) INTO v_st0
    FROM public.v_piece_state ps;
  v_week := (now() AT TIME ZONE 'Europe/Athens')::date;
  v_week := v_week - ((extract(dow FROM v_week)::int + 1) % 7);
  SELECT md5(public.plan_board(v_week, 'owner')::text) INTO v_b0;

  -- ===== PART 1: is_stock (one expression; the rest of 071's view as it is) =====
  CREATE OR REPLACE VIEW public.v_piece_state WITH (security_invoker = true) AS
  SELECT pp.piece_id, pp.shipment_id, vs.kind, vs.order_id, vs.nat_order_id, vs.order_stop_id,
         pp.parent_piece_id, pp.pallets, pp.leave_by, pp.position_location_id, pp.last_drop_stop_id,
         (pp.position_location_id = hub.id) IS TRUE AS at_hub,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id) AS waiting,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN pp.last_drop_stop_id END AS end_stop_id,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN es.planned_to END AS national_end_at,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id
              THEN (es.planned_to AT TIME ZONE 'Europe/Athens')::date END AS end_day,
         vs.nat_ready_day, vs.nat_due_day,
         (pp.position_location_id = vs.nat_to_location_id AND er.status <> 'cancelled'
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS executed,
         (pp.position_location_id = vs.nat_to_location_id
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date > vs.nat_due_day) IS TRUE AS late,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id
          AND coalesce(pp.leave_by, vs.nat_due_day) < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS overdue,
         -- 114 (owner 8/11): stock = a part left where a truck brought it, or at Veroia; a part split at its loading
         -- point before any truck took it is a waiting load, not stock
         (pp.parent_piece_id IS NOT NULL AND pp.own_last_leg_id IS NULL
          AND (pp.eff_last_leg_id IS NOT NULL OR (pp.position_location_id = hub.id) IS TRUE)) AS is_stock
  FROM public.v_piece_pos pp
  JOIN public.v_shipments vs ON vs.shipment_id = pp.shipment_id AND vs.live
  LEFT JOIN public.locations hub ON hub.is_hub
  LEFT JOIN public.rt_stops es ON es.id = pp.last_drop_stop_id
  LEFT JOIN public.ct_round_trips er ON er.id = es.rt_id
  WHERE NOT pp.is_split;
  IF md5(pg_get_viewdef('public.v_piece_state'::regclass, true)) <> m_view_new THEN
    RAISE EXCEPTION '114 proof: v_piece_state is not the measured text (md5 %)', md5(pg_get_viewdef('public.v_piece_state'::regclass, true));
  END IF;

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_split_piece(jsonb,text,text)', ARRAY[p_1a, p_2a, p_3a, p_4a], ARRAY[p_1b, p_2b, p_3b, p_4b], 'a43e5db008e7d54f7c1bf59f96c5590f'),
      ('public.plan_shipment_problem(bigint)', ARRAY[s_1a], ARRAY[s_1b], '9f2a79bd4fd6bb5fabbea083c36ede04'),
      ('public.plan_board(date,text)', ARRAY[b_1a], ARRAY[b_1b], '810f110372c1908b061bcd527257d04c')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    SELECT lanname INTO v_lang FROM pg_language WHERE oid = p.prolang;
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR v_lang NOT IN ('plpgsql', 'sql') THEN
      RAISE EXCEPTION '114: % is not a plpgsql / sql function with search_path=public - stop', v_g.sig;
    END IF;
    v_new := p.prosrc;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '114: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '114: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; language, SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE %s %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), v_lang,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef
       OR (SELECT provolatile FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.provolatile THEN
      RAISE EXCEPTION '114 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT md5(coalesce(string_agg(ps.piece_id || ':' || ps.is_stock, '|' ORDER BY ps.piece_id), '')) INTO v_st1
    FROM public.v_piece_state ps;
  IF v_st1 <> v_st0 THEN
    RAISE EXCEPTION '114 proof: a piece changed its is_stock - nothing kept, send this line to the coordinator';
  END IF;
  SELECT count(*) FILTER (WHERE public.plan_shipment_problem(s.id) IS NOT NULL) INTO v_bad1
    FROM public.shipments s WHERE s.deleted_at IS NULL;
  IF v_bad1 <> v_bad0 THEN
    RAISE EXCEPTION '114 proof: shipments with a rule problem % -> % - nothing kept, send this line to the coordinator', v_bad0, v_bad1;
  END IF;
  -- the board: the same answer once the new key is taken out of waiting[]
  SELECT md5((b || jsonb_build_object('waiting', coalesce((SELECT jsonb_agg(w.v - 'parent_piece_id' ORDER BY w.o)
                FROM jsonb_array_elements(b->'waiting') WITH ORDINALITY w(v, o)), '[]'::jsonb)))::text),
         (SELECT count(*) FROM jsonb_array_elements(b->'waiting') w(v) WHERE NOT (w.v ? 'parent_piece_id'))
    INTO v_b1, v_pc
    FROM (SELECT public.plan_board(v_week, 'owner') AS b) x;
  IF v_b1 <> v_b0 OR v_pc <> 0 THEN
    RAISE EXCEPTION '114 proof: the board of % answers otherwise (or a waiting item lacks parent_piece_id: %)', v_week, v_pc;
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '114 proof: trigger count % -> %', v_trg0, v_trg1; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '114 OK: a waiting load splits at its loading point; shipments %, with a rule problem % (as before); is_stock unchanged; board of % unchanged; triggers %',
    v_sh, v_bad1, v_week, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_split_piece(jsonb,text,text)'::regprocedure) AS split_md5,
       md5(pg_get_viewdef('public.v_piece_state'::regclass, true)) AS piece_state_md5;
