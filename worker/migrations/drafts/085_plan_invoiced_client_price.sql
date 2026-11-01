-- 085 - NATIONAL v5: THE CLIENT CHANGES UNTIL THE ORDER IS INVOICED (F62), AN INVOICED PRICE ONLY FROM OWNER /
-- ACCOUNTANT, AND THE EDIT FORM READS "INVOICED".
-- Owner 31/10 (through the coordinator): the price of a national changes from every role while it is not invoiced,
--   after that only owner / accountant (flexible-rules study 2026-10-28 K1, question 6); the client (F62, Sotiris'
--   simulation W45) changes from every role while it is not invoiced, after that from nobody. #189 locks the price
--   on the screen only; the base must hold it (principle 4) - and the form can lock only what the read tells it.
-- Measured 1/11 (SELECT, production): 7 live v5 nationals are invoiced (ids 17, 84, 86, 89, 90, 91, 92; ERP numbers
--   of 29-30/10, through the invoicing screen), 19 are not. From 085 on, those 7 keep their client and change price
--   only from owner / accountant.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 077 and 081 applied, the LIVE texts of plan_order_update (081's, md5 of prosrc = production
--           SELECT 1/11) and plan_order_read (077's), day L set, B-54 = the enabled triggers
--   PART 1  plan_order_update = live text + 3 hunks. set.client_id is accepted (a live client, else no_client, as
--           plan_orders_create). A CHANGE of the client on an invoiced order refuses invoiced_client (every role);
--           a CHANGE of the price on an invoiced order refuses invoiced_price unless p_role is owner / accountant.
--           The same value sent back passes (only a change is refused). The order row is already locked (for no
--           key update) when the flag is read, so an invoicing that lands meanwhile waits for this save. The audit
--           row of the order (before / after of the columns that changed) names the client change as it does the
--           price; the order's pending pallet rows follow the new client (plan_h_pallet_sync reads it, 073).
--   PART 2  plan_order_read = live text + 1 hunk: order.invoiced (true / false, never null) beside the price.
--   PART 3  proofs, NOTICE "085 OK: ..."
-- No table, no column, no trigger, no grant, no row written. Worker: two texts in PLAN_RULE_TEXT (invoiced_client,
-- invoiced_price) - until they are deployed a refusal still names its code (the Worker's generic line for an
-- unknown plan code), never a silent pass. 083 / 084 (open drafts) patch other functions: none in common with 085.
-- RUN: after 15:00 or with the owner's explicit yes: 085_plan_invoiced_client_price_dryrun.sql, then this file,
-- then 085_plan_invoiced_client_price_verify.sql. REVERSE: 085_plan_invoiced_client_price_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  o_1a CONSTANT text := $h$  perform plan_h_keys(v_set, array['price', 'reference', 'notes', 'goods', 'temperature_c', 'pallet_exchange', 'direction'], 'set');
$h$;
  o_1b CONSTANT text := $h$  -- 085 (F62): the client is corrected here too, while the order is not invoiced
  perform plan_h_keys(v_set, array['client_id', 'price', 'reference', 'notes', 'goods', 'temperature_c', 'pallet_exchange', 'direction'], 'set');
$h$;
  o_2a CONSTANT text := $h$  -- temperature_c is unconstrained numeric: NaN / +-Infinity would be stored as they are (A2)
$h$;
  o_2b CONSTANT text := $h$  -- 085 (owner 31/10, F62 + flexible-rules study K1 question 6): an invoiced national is the ERP's. Its client
  -- changes from no role; its price only from owner / accountant (the invoicing screen corrects it with the invoice).
  -- Not invoiced: both change from every role, as before 085. Only a CHANGE is refused - the same value sent back
  -- (a replay, another screen) passes. The order row is locked above (for no key update), so an invoicing that lands
  -- meanwhile waits for this save and the flag is read as it is.
  if v_set ? 'client_id' and (v_set->>'client_id')::bigint is distinct from n.client_id then
    if n.invoiced is true then perform plan_h_raise('invoiced_client', n.id::text); end if;
    -- a live client, as plan_orders_create (072): never null, never one that is gone
    if (v_set->>'client_id') is null
       or not exists (select 1 from clients where id = (v_set->>'client_id')::bigint and deleted_at is null) then
      perform plan_h_raise('no_client', coalesce(v_set->>'client_id', 'null'));
    end if;
  end if;
  if v_set ? 'price' and n.invoiced is true and p_role not in ('owner', 'accountant')
     and (v_set->>'price')::numeric is distinct from n.price then
    perform plan_h_raise('invoiced_price', n.id::text);
  end if;
  -- temperature_c is unconstrained numeric: NaN / +-Infinity would be stored as they are (A2)
$h$;
  o_3a CONSTANT text := $h$    price = case when v_set ? 'price' then (v_set->>'price')::numeric else price end,
$h$;
  o_3b CONSTANT text := $h$    client_id = case when v_set ? 'client_id' then (v_set->>'client_id')::bigint else client_id end,
    price = case when v_set ? 'price' then (v_set->>'price')::numeric else price end,
$h$;
  r_1a CONSTANT text := $h$               'price', n.price, 'reference', n.reference, 'goods', n.goods, 'notes', n.notes,
$h$;
  r_1b CONSTANT text := $h$               'price', n.price, 'reference', n.reference, 'goods', n.goods, 'notes', n.notes,
               -- 085: the form locks the client (and, for the roles that may not, the price) of an invoiced order
               'invoiced', coalesce(n.invoiced, false),
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int; v_e text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_order_read(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '085: 077 is not applied (order 077 -> 081 -> 085) - stop';
  END IF;
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '085: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_order_update(jsonb,text,text)', '323eb4ccde77d1848c74a8b4ab310021'),
      ('public.plan_order_read(bigint,text)', 'e29477dd275c5640bc7a6e06fbe4caf5')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '085: % is not its live text of 1/11 (085 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '085: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;
  -- ===== PART 1 + PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_order_update(jsonb,text,text)', ARRAY[o_1a, o_2a, o_3a], ARRAY[o_1b, o_2b, o_3b], 'f3f69925542ec94d04f2def48cc8628e'),
      ('public.plan_order_read(bigint,text)', ARRAY[r_1a], ARRAY[r_1b], '3debf860290f6e4d382028ad5b7e96d4')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '085: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '085: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '085: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '085 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '085 proof: triggers % -> % (085 adds none)', v_trg0, v_trg1; END IF;
  -- the read still refuses an order that is not there, in its own words (077's proof)
  BEGIN
    PERFORM public.plan_order_read(-1, 'owner');
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_e = PG_EXCEPTION_HINT;
  END;
  IF v_e IS DISTINCT FROM 'plan:order_gone' THEN
    RAISE EXCEPTION '085 proof: plan_order_read(-1) answered % (expected plan:order_gone)', coalesce(v_e, 'no refusal');
  END IF;
  RAISE NOTICE '085 OK: plan_order_update takes the client and refuses a change of an invoiced client / price by role, plan_order_read says invoiced, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS order_update_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_read(bigint,text)'::regprocedure) AS order_read_md5;
