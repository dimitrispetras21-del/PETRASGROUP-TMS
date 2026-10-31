-- 087 - NATIONAL v5: THE PART THAT STAYS AT VEROIA LEAVES BY THE DAY THE USER WRITES (B-26, Figma 2011:8744).
-- The Veroia panel's "Spase..." splits a delivery into parts; a part with no truck stays as stock that "leaves by"
-- (decision 18: a date, the evening before the requested national day; "22:00" is the screen's text). Today the base
-- writes nat_due_day - 1 and refuses any other key (plan_h_keys 'part': pallets, target, stops): the dialog could only
-- say "the deadline is written at the save". Figma 8744 shows it, prefilled and editable; pack 4 (1/11): editable,
-- prefilled with the end of the day.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 080 applied (the last migration that patched plan_split_piece), 087 not applied, the LIVE text of
--           plan_split_piece (md5 of prosrc = production, SELECT 1/11/2026), day L set, B-54 = the enabled triggers
--   PART 1  plan_split_piece = live text + 2 hunks: a part WITHOUT a target may carry leave_by, a 'YYYY-MM-DD' text;
--           absent = nat_due_day - 1 as before (the screen sends nothing it did not show). leave_by with a target, a
--           null, a number or any other shape = bad_input (a part that rides now has no deadline: decision 18). A day
--           already gone is NOT refused (relaxed rules, owner 31/10): the dialog warns before the save, and the panel
--           shows the part late (v_piece_state.overdue reads coalesce(leave_by, nat_due_day)).
--   PART 2  proofs, NOTICE "087 OK: ..."
-- No table, no column (shipment_pieces.leave_by is 071's date), no trigger, no grant, no row written. No Worker change:
-- POST /plan/pieces/split forwards the body as it is (index.js PLAN_ROUTES 'split'), and bad_input has its text.
-- 083 (plan_rt_create), 084 (plan_move_pieces), 085 (plan_order_read / plan_order_update) touch other functions; any
-- order between them is fine.
-- RUN: after 15:00 or with the owner's explicit yes: 087_plan_split_leave_by_dryrun.sql, then this file, then
-- 087_plan_split_leave_by_verify.sql. REVERSE: 087_plan_split_leave_by_rollback.sql (the stock rows written with a
-- chosen day keep it: it is what the user decided).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  k_1a CONSTANT text := $h$    perform plan_h_keys(part, array['pallets', 'target', 'stops'], 'part');
$h$;
  k_1b CONSTANT text := $h$    perform plan_h_keys(part, array['pallets', 'target', 'stops', 'leave_by'], 'part');
    -- 087 (B-26, 1/11): the day a part that stays leaves by, as the user wrote it. Only on a part that stays
    -- (decision 18: a part that rides now has no leave_by), only a plain date: the screen sends 'YYYY-MM-DD'.
    if part ? 'leave_by' then
      if part ? 'target' then perform plan_h_raise('bad_input', 'part.leave_by with target'); end if;
      if jsonb_typeof(part->'leave_by') is distinct from 'string' or (part->>'leave_by') !~ '^\d{4}-\d{2}-\d{2}$' then
        perform plan_h_raise('bad_input', 'part.leave_by: YYYY-MM-DD');
      end if;
      perform (part->>'leave_by')::date;   -- 2026-02-30 -> invalid_datetime_format -> bad_input (the handler below)
    end if;
$h$;
  k_2a CONSTANT text := $h$            case when part ? 'target' then null else ps.nat_due_day - 1 end, p_actor)
$h$;
  k_2b CONSTANT text := $h$            case when part ? 'target' then null when part ? 'leave_by' then (part->>'leave_by')::date
                 else ps.nat_due_day - 1 end, p_actor)
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '087: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_split_piece(jsonb,text,text)', '4a61314bbab1492431750fd75cffdb14')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '087: % is not its live text of 1/11 (080 not applied, 087 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '087: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_split_piece(jsonb,text,text)', ARRAY[k_1a, k_2a], ARRAY[k_1b, k_2b], 'd41717aed68e31def164cee48df6694d')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '087: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '087: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '087: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '087 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 2: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '087 proof: triggers % -> % (087 adds none)', v_trg0, v_trg1; END IF;
  IF NOT has_function_privilege('service_role', 'public.plan_split_piece(jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '087 proof: the Worker lost EXECUTE on plan_split_piece';
  END IF;
  RAISE NOTICE '087 OK: plan_split_piece takes leave_by on a part that stays (YYYY-MM-DD), triggers %', v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_split_piece(jsonb,text,text)'::regprocedure) AS split_md5;
