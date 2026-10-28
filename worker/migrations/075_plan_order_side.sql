-- 075 - NATIONAL v5: THE SIDE OF A NATIONAL ORDER IS STORED (live bug 28/10, order #17).
-- The create form asks KATHODOS / ANODOS; 072 plan_orders_create never stored it (decision 20 kept
-- national_orders.direction NULL: "the F4 readers read v_shipments") and the board derived the side from the hub. A
-- national order that never touches Veroia (#17: one Greek place to another, entered ANODOS, no truck) showed as
-- KATHODOS while the screen said "saved": the user's choice was lost silently (principle 1).
-- WHAT, in ONE DO block (ASCII only; the arrow of the column's vocabulary is chr(8594)):
--   PART 0  guards: 074 applied (order 074 -> 074b -> 075), the LIVE texts of plan_orders_create, plan_order_update
--           and plan_board (md5, measured on production 28/10), B-54 = triggers
--   PART 1  two closed helpers: plan_h_side_dir (KATHODOS / ANODOS -> the column's 'North->South' / 'South->North',
--           the vocabulary of the 12 old rows and of the facade's "Direction") and plan_h_dir_side (back)
--   PART 2  the three functions = live text + their hunks (reversible byte for byte, md5 after):
--           plan_orders_create stores order.direction (optional; refused unless KATHODOS / ANODOS, and with a target
--           it must be the target's side); plan_order_update accepts set.direction; plan_board gives every waiting[]
--           item its order's 'direction' (KATHODOS / ANODOS, null for a VS bridge or an order without one)
--   PART 3  proofs, NOTICE "075 OK: ..."
-- No table, no column, no trigger (B-54 stays), no row written. The Worker forwards the body as it is (checked on
-- the live source, deploy/worker-plan-f5-l @ cd3a4568): no Worker change. The board reads waiting[].direction only
-- when the hub cannot tell the side (core/wn5-logic.js, F4a's change).
-- RUN: after 15:00 or with the owner's explicit yes: 075_plan_order_side_dryrun.sql, then this file, then
-- 075_plan_order_side_verify.sql. REVERSE: 075_plan_order_side_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (function, anchor in the live text, replacement); each anchor is in its live text exactly once
  h_c1a CONSTANT text := E'''notes'', ''shipments'', ''stock_lot_id''], ''order'');\n';
  h_c1b CONSTANT text := E'''notes'', ''shipments'', ''stock_lot_id'', ''direction''], ''order'');\n'
    || E'    -- 075 (owner 28/10, live order #17): the side the user chose is stored, never dropped silently; KATHODOS or\n'
    || E'    -- ANODOS only, and with a target it is the target''s side\n'
    || E'    if o ? ''direction'' and (coalesce(o->>''direction'', '''') not in (''KATHODOS'', ''ANODOS'')\n'
    || E'                            or (p ? ''target'' and o->>''direction'' is distinct from p->''target''->>''side'')) then\n'
    || E'      perform plan_h_raise(''bad_input'', ''order.direction'');\n'
    || E'    end if;\n';
  h_c2a CONSTANT text := E'    -- Never truck_id / partner_id / status (spec 2.1: no mirror); direction and type stay NULL (decision 20:\n'
    || E'    -- the F4 readers read v_shipments).\n'
    || E'    insert into national_orders (legacy_id, client_id, price, reference, goods, temperature_c, pallet_exchange, notes,\n';
  h_c2b CONSTANT text := E'    -- Never truck_id / partner_id / status (spec 2.1: no mirror); type stays NULL (decision 20: the F4 readers read\n'
    || E'    -- v_shipments); direction = the side the user chose (075), in the column''s own vocabulary.\n'
    || E'    insert into national_orders (legacy_id, client_id, price, reference, goods, temperature_c, pallet_exchange, notes, direction,\n';
  h_c3a CONSTANT text := E'            coalesce((o->>''pallet_exchange'')::boolean, false), o->>''notes'',\n';
  h_c3b CONSTANT text := E'            coalesce((o->>''pallet_exchange'')::boolean, false), o->>''notes'', plan_h_side_dir(o->>''direction''),\n';
  h_u1a CONSTANT text := E'  perform plan_h_keys(v_set, array[''price'', ''reference'', ''notes'', ''goods'', ''temperature_c'', ''pallet_exchange''], ''set'');\n';
  h_u1b CONSTANT text := E'  perform plan_h_keys(v_set, array[''price'', ''reference'', ''notes'', ''goods'', ''temperature_c'', ''pallet_exchange'', ''direction''], ''set'');\n'
    || E'  -- 075: the order''s side is corrected here too (KATHODOS / ANODOS only), as plan_orders_create stores it\n'
    || E'  if v_set ? ''direction'' and coalesce(v_set->>''direction'', '''') not in (''KATHODOS'', ''ANODOS'') then\n'
    || E'    perform plan_h_raise(''bad_input'', ''set.direction'');\n'
    || E'  end if;\n';
  h_u2a CONSTANT text := E'                           else pallet_exchange end,\n';
  h_u2b CONSTANT text := E'                           else pallet_exchange end,\n'
    || E'    direction = case when v_set ? ''direction'' then plan_h_side_dir(v_set->>''direction'') else direction end,\n';
  h_b1a CONSTANT text := E'             || case when ps.nat_order_id is not null then jsonb_build_object(''price'', nor.price)\n';
  h_b1b CONSTANT text := E'             -- 075: the side of a national order (the user''s choice); null for a VS bridge or an order without one\n'
    || E'             || jsonb_build_object(''direction'', plan_h_dir_side(nor.direction))\n'
    || E'             || case when ps.nat_order_id is not null then jsonb_build_object(''price'', nor.price)\n';
  v_g record; v_h record; v_src text; v_new text; v_trg0 int; v_trg1 int; p pg_proc%rowtype;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_bridge_sync(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '075: 074 must be applied first (order 074 -> 074b -> 075)';
  END IF;
  IF to_regprocedure('public.plan_h_side_dir(text)') IS NOT NULL OR to_regprocedure('public.plan_h_dir_side(text)') IS NOT NULL THEN
    RAISE EXCEPTION '075: already applied - run 075_plan_order_side_verify.sql instead';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_orders_create(jsonb,text,text)', 'fae8f0f9bdd45e5ee44c8feeadc96bc7'),
      ('public.plan_order_update(jsonb,text,text)', '114a6555848062a18b7f7fe8e57d70d6'),
      ('public.plan_board(date,text)', 'fc33642e81560b42f217b80c98543467')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '075: % is not the live text measured 28/10 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0) THEN
    RAISE EXCEPTION '075: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;

  -- ===== PART 1: THE TWO HELPERS (closed: only the SECURITY DEFINER plan_* call them) =====
  -- One mapping, both ways (principle 3): the plan_* speak KATHODOS / ANODOS, national_orders.direction keeps the
  -- arrows of its 12 old rows and of the facade's "Direction" label (CLAUDE.md: national orders use arrows).
  CREATE FUNCTION public.plan_h_side_dir(p_side text) RETURNS text
    LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  select case p_side when 'KATHODOS' then 'North' || chr(8594) || 'South' when 'ANODOS' then 'South' || chr(8594) || 'North' end
$f$;
  CREATE FUNCTION public.plan_h_dir_side(p_dir text) RETURNS text
    LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  select case p_dir when 'North' || chr(8594) || 'South' then 'KATHODOS' when 'South' || chr(8594) || 'North' then 'ANODOS' end
$f$;
  REVOKE ALL ON FUNCTION public.plan_h_side_dir(text), public.plan_h_dir_side(text) FROM PUBLIC, anon, authenticated, service_role;

  -- ===== PART 2: THE THREE FUNCTIONS = LIVE TEXT + HUNKS (md5 after = measured on the PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_orders_create(jsonb,text,text)', ARRAY[h_c1a, h_c2a, h_c3a], ARRAY[h_c1b, h_c2b, h_c3b], 'b0c6b0ac835066e1c21c99c9aee7604c'),
      ('public.plan_order_update(jsonb,text,text)', ARRAY[h_u1a, h_u2a], ARRAY[h_u1b, h_u2b], 'b614c9b9d45a1b4d7345ca811e1d3e7c'),
      ('public.plan_board(date,text)', ARRAY[h_b1a], ARRAY[h_b1b], '670f72f60edcf09f955fb1f6a74143b9')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '075: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '075: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '075: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants (the Worker's EXECUTE on the three plan_*)
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m THEN
      RAISE EXCEPTION '075 proof: % does not hold its generated text', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  IF NOT has_function_privilege('service_role', 'public.plan_orders_create(jsonb,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.plan_order_update(jsonb,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '075 proof: the Worker lost EXECUTE on a plan_* it calls';
  END IF;
  IF has_function_privilege('service_role', 'public.plan_h_side_dir(text)', 'EXECUTE') OR has_function_privilege('anon', 'public.plan_h_side_dir(text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.plan_h_dir_side(text)', 'EXECUTE') OR has_function_privilege('anon', 'public.plan_h_dir_side(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '075 proof: a helper is open to an API role';
  END IF;
  IF public.plan_h_dir_side(public.plan_h_side_dir('KATHODOS')) <> 'KATHODOS' OR public.plan_h_dir_side(public.plan_h_side_dir('ANODOS')) <> 'ANODOS'
     OR public.plan_h_side_dir('ANODOS') <> 'South' || chr(8594) || 'North' OR public.plan_h_side_dir('north') IS NOT NULL THEN
    RAISE EXCEPTION '075 proof: the side mapping is not the column''s vocabulary both ways';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '075 proof: triggers % -> % (075 adds none)', v_trg0, v_trg1; END IF;
  RAISE NOTICE '075 OK: 2 helpers (closed), 3 functions patched (create / update store direction, board shows it), triggers %, national orders with a side %',
    v_trg1, (SELECT count(*) FROM public.national_orders WHERE direction IS NOT NULL AND deleted_at IS NULL);
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_h_side_dir(text)') IS NOT NULL THEN '075 OK' ELSE '075 NOT APPLIED' END AS result,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_orders_create(jsonb,text,text)'::regprocedure) AS create_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS update_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure) AS board_md5;
