-- 077 - NATIONAL v5: THE EDIT OF A NATIONAL ORDER IS COMPLETE (live real-user test 28/10, F13 + F21).
-- F13: the edit form opened without the order's values (notes always; price, PE and points for an order on a cycle):
--   plan_board carries the commercial fields only for WAITING pieces and no read answered one order by its id.
-- F21: an existing order could not gain or lose a point (live #84 needs a 2nd delivery): plan_order_update (072) only
--   changes shipments that exist; the only way was delete and enter again.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 075 applied (order 075 -> 077; 076 touches plan_board only), 077 not applied, the LIVE text of
--           plan_order_update (md5 = 075's generated text, measured on the production-shaped copy), B-54 = triggers
--   PART 1  plan_order_read(nat_order_id, role): one national order as the edit form shows it - every commercial
--           field and every live point (vs_locked, rides, the codes of its cycles). Born closed, EXECUTE for the
--           Worker only. The answer passes plan_h_strip_amounts (decision 9); the price is shown to every role
--           (owner 23/8: the dispatcher sees the selling price until the P&L phase).
--   PART 2  plan_order_update = live text + 5 hunks (reversible byte for byte, md5 after):
--           a shipments[] item WITHOUT shipment_id = a NEW point (one shipment + one piece that WAITS: no cycle, no
--           leg - owner 28/10: the dispatcher puts it on a truck with one board move); {shipment_id, remove: true}
--           = the point leaves the order (soft, only while nothing of it rides, never a VS bridge, never the last
--           point); a new point is a creation, so it carries the screen's request_id (decision 44, replayed);
--           the answer names the new and the removed ids.
--   PART 3  proofs, NOTICE "077 OK: ..."
-- No table, no column, no trigger (B-54 stays), no row written. The Worker gains ONE read route
-- (GET /plan/orders/:id -> plan_order_read); the PATCH already forwards the body as it is.
-- RUN: after 15:00 or with the owner's explicit yes: 077_plan_order_edit_dryrun.sql, then this file, then
-- 077_plan_order_edit_verify.sql. REVERSE: 077_plan_order_edit_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  h_1a CONSTANT text := $h$  n national_orders%rowtype; n2 national_orders%rowtype; a shipments%rowtype; b shipments%rowtype;
$h$;
  h_1b CONSTANT text := $h$  n national_orders%rowtype; n2 national_orders%rowtype; a shipments%rowtype; b shipments%rowtype;
  -- 077: a new point (v_sh, v_pc), a removed one (rp), the replay of a creation (v_ans, v_rid)
  v_sh shipments%rowtype; v_pc shipment_pieces%rowtype; rp record; v_ans jsonb; v_rid boolean := false;
  v_new_sh bigint[] := '{}'; v_new_pc bigint[] := '{}'; v_rm bigint[] := '{}';
$h$;
  h_2a CONSTANT text := $h$  perform plan_h_keys(p, array['nat_order_id', 'set', 'shipments'], 'p');
$h$;
  h_2b CONSTANT text := $h$  perform plan_h_keys(p, array['nat_order_id', 'set', 'shipments', 'request_id'], 'p');
  -- 077 (decision 44): a new point is a creation, so it carries the screen's request_id; the same request again =
  -- the first answer, nothing written (a lost answer + a second press would otherwise add the point twice). An edit
  -- without a new point may carry one too, and replays the same way. Before any state is read (plan_h_replay).
  if p ? 'request_id' or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p->'shipments') = 'array'
                                                                     then p->'shipments' end) e
                                  where jsonb_typeof(e) = 'object' and not e ? 'shipment_id') then
    v_ans := plan_h_replay(p, 'plan_order_update', p_actor);
    if v_ans is not null then return v_ans; end if;
    v_rid := true;
  end if;
$h$;
  h_3a CONSTANT text := $h$                                 'origin_location_id', 'dest_location_id'], 'shipment');
    select * into a from shipments where id = (s->>'shipment_id')::bigint for no key update;
    if a.id is null then perform plan_h_raise('bad_input', 'shipment_id'); end if;
    if a.order_stop_id is not null then perform plan_h_raise('vs_locked', a.id::text); end if;
    if a.nat_order_id is distinct from n.id or a.deleted_at is not null then perform plan_h_raise('bad_input', 'shipment_id'); end if;
$h$;
  h_3b CONSTANT text := $h$                                 'origin_location_id', 'dest_location_id', 'remove'], 'shipment');
    -- 077 (F21, owner 28/10): no shipment_id = a NEW point of this order: one shipment and one piece that WAITS (no
    -- cycle, no leg; the dispatcher puts it on a truck with one board move). Every field is required and checked as
    -- in plan_orders_create; the four window ends are the user's (the form pre-fills a whole day, never an hour).
    if not s ? 'shipment_id' then
      if s ? 'remove' or not (s ? 'origin_location_id' and s ? 'dest_location_id' and s ? 'pallets') then
        perform plan_h_raise('bad_input', 'shipment:new');
      end if;
      if s->>'load_from' is null or s->>'load_to' is null or s->>'deliver_from' is null or s->>'deliver_to' is null then
        perform plan_h_raise('no_window', 'shipment');
      end if;
      if not (isfinite((s->>'load_from')::timestamptz) and isfinite((s->>'load_to')::timestamptz)
              and isfinite((s->>'deliver_from')::timestamptz) and isfinite((s->>'deliver_to')::timestamptz)) then
        perform plan_h_raise('no_window', 'shipment:finite');
      end if;
      -- 071 shipments_win / shipments_ends / shipments_pallets as refusals by name, never a raw 23514 without its code
      if not ((s->>'load_from')::timestamptz <= (s->>'load_to')::timestamptz
              and (s->>'deliver_from')::timestamptz <= (s->>'deliver_to')::timestamptz
              and (s->>'load_from')::timestamptz <= (s->>'deliver_to')::timestamptz) then
        perform plan_h_raise('no_window', 'shipment:order');
      end if;
      if (s->>'pallets')::numeric <> round((s->>'pallets')::numeric, 1) then
        perform plan_h_raise('bad_input', 'pallets:one decimal');
      end if;
      if not (abs((s->>'pallets')::numeric) < 'Infinity'::numeric) then perform plan_h_raise('bad_input', 'pallets:finite'); end if;
      if not ((s->>'pallets')::numeric > 0) then perform plan_h_raise('bad_input', 'pallets:positive'); end if;
      perform plan_h_location((s->>'origin_location_id')::bigint);
      perform plan_h_location((s->>'dest_location_id')::bigint);
      if (s->>'origin_location_id')::bigint = (s->>'dest_location_id')::bigint then
        perform plan_h_raise('bad_input', 'shipment:same_place');
      end if;
      insert into shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      values (n.id, (s->>'origin_location_id')::bigint, (s->>'dest_location_id')::bigint, (s->>'pallets')::numeric,
              (s->>'load_from')::timestamptz, (s->>'load_to')::timestamptz, (s->>'deliver_from')::timestamptz,
              (s->>'deliver_to')::timestamptz, p_actor)
      returning * into v_sh;
      perform plan_h_audit(p_actor, p_role, 'create', 'shipments', v_sh.id::text, null, to_jsonb(v_sh));
      insert into shipment_pieces (shipment_id, pallets, created_by) values (v_sh.id, v_sh.pallets, p_actor) returning * into v_pc;
      perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', v_pc.id::text, null, to_jsonb(v_pc));
      v_new_sh := v_new_sh || v_sh.id;
      v_new_pc := v_new_pc || v_pc.id;
      continue;
    end if;
    select * into a from shipments where id = (s->>'shipment_id')::bigint for no key update;
    if a.id is null then perform plan_h_raise('bad_input', 'shipment_id'); end if;
    if a.order_stop_id is not null then perform plan_h_raise('vs_locked', a.id::text); end if;
    if a.nat_order_id is distinct from n.id or a.deleted_at is not null then perform plan_h_raise('bad_input', 'shipment_id'); end if;
    -- 077 (F21): {shipment_id, remove: true} = this point leaves the order. Soft only (071 hard_delete), with its
    -- reason and actor, by the rule of a place change: only while nothing of it rides (a piece on a cycle is moved or
    -- taken off first, with its own list of consequences). The last point is never removed here (below).
    if s ? 'remove' then
      if s->'remove' is distinct from 'true'::jsonb or (select count(*) from jsonb_object_keys(s)) <> 2 then
        perform plan_h_raise('bad_input', 'shipment:remove');
      end if;
      if exists (select 1 from piece_legs l join shipment_pieces pp on pp.id = l.piece_id
                  where pp.shipment_id = a.id and l.deleted_at is null) then
        perform plan_h_raise('piece_busy', 'shipment:' || a.id);
      end if;
      for rp in select * from shipment_pieces where shipment_id = a.id and deleted_at is null order by id for no key update loop
        update shipment_pieces set deleted_at = now(), deleted_reason = 'plan_order_update: point removed', deleted_by = p_actor
         where id = rp.id returning * into v_pc;
        perform plan_h_audit(p_actor, p_role, 'delete', 'shipment_pieces', rp.id::text, to_jsonb(rp), to_jsonb(v_pc));
      end loop;
      update shipments set deleted_at = now(), deleted_reason = 'plan_order_update: point removed', deleted_by = p_actor
       where id = a.id returning * into b;
      perform plan_h_audit(p_actor, p_role, 'delete', 'shipments', a.id::text, to_jsonb(a), to_jsonb(b));
      v_rm := v_rm || a.id;
      continue;
    end if;
$h$;
  h_4a CONSTANT text := $h$  v_sum := plan_h_order_summary((select jsonb_agg(to_jsonb(x) order by x.id) from shipments x
$h$;
  h_4b CONSTANT text := $h$  -- 077: an order keeps at least one point; none left is the delete of the order (plan_delete, with its list)
  if not exists (select 1 from shipments where nat_order_id = n.id and deleted_at is null) then
    perform plan_h_raise('bad_input', 'shipments:last');
  end if;
  v_sum := plan_h_order_summary((select jsonb_agg(to_jsonb(x) order by x.id) from shipments x
$h$;
  h_5a CONSTANT text := $h$  perform plan_h_finish();
  return plan_h_ok('plan_order_update', jsonb_build_object('nat_order_id', n.id, 'shipment_ids', to_jsonb(v_ids)), null, null);
$h$;
  h_5b CONSTANT text := $h$  -- 077: the new and the removed points are named in the answer (the form says what it saved); the record of a
  -- request_id is written with the rows, before the deferred rules, so a refusal at the end undoes both
  v_ans := plan_h_ok('plan_order_update', jsonb_build_object('nat_order_id', n.id, 'shipment_ids', to_jsonb(v_ids),
             'new_shipment_ids', to_jsonb(v_new_sh), 'new_piece_ids', to_jsonb(v_new_pc),
             'removed_shipment_ids', to_jsonb(v_rm)), null, null);
  if v_rid then perform plan_h_remember(p, 'plan_order_update', v_ans, p_actor, p_role); end if;
  perform plan_h_finish();
  return v_ans;
$h$;
  v_g record; v_h record; v_src text; v_new text; v_trg0 int; v_trg1 int; v_e text; p pg_proc%rowtype;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_h_dir_side(text)') IS NULL THEN
    RAISE EXCEPTION '077: 075 must be applied first (order 075 -> 077)';
  END IF;
  IF to_regprocedure('public.plan_order_read(bigint,text)') IS NOT NULL THEN
    RAISE EXCEPTION '077: already applied - run 077_plan_order_edit_verify.sql instead';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_order_update(jsonb,text,text)', 'b614c9b9d45a1b4d7345ca811e1d3e7c')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '077: % is not the live text after 075 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0) THEN
    RAISE EXCEPTION '077: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;

  -- ===== PART 1: THE READ OF ONE ORDER (F13) =====
  CREATE FUNCTION public.plan_order_read(p_nat_order_id bigint, p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
declare n national_orders%rowtype;
begin
  -- 077 (F13, live test 28/10): what the edit form shows of ONE national order before it opens - every commercial
  -- field and every live point, wherever its pieces are (waiting, on a cycle, delivered). plan_board carries these
  -- only for waiting pieces, so an order on a cycle opened with empty fields and the user could not see what a save
  -- would keep. A NULL stays a JSON null, never a missing key (facade trap 2): the form tells "empty" from "unknown".
  -- rides = a live leg on any piece of the point: the SAME rule plan_order_update uses to refuse a place change or a
  -- removal, so the form greys exactly what the database would refuse.
  if p_role is null or p_role not in ('owner', 'dispatcher', 'management', 'accountant', 'warehouse') then
    perform plan_h_raise('bad_input', 'role');
  end if;
  select * into n from national_orders where id = p_nat_order_id;
  if n.id is null or n.deleted_at is not null then
    perform plan_h_raise('order_gone', coalesce(p_nat_order_id::text, 'null'));
  end if;
  if not exists (select 1 from shipments where nat_order_id = n.id and deleted_at is null) then
    perform plan_h_raise('order_not_v5', n.id::text);
  end if;
  return plan_h_strip_amounts(jsonb_build_object('ok', true, 'op', 'plan_order_read',
    'order', jsonb_build_object('nat_order_id', n.id, 'legacy_id', n.legacy_id, 'client_id', n.client_id,
               'client', (select c.company_name from clients c where c.id = n.client_id),
               'price', n.price, 'reference', n.reference, 'goods', n.goods, 'notes', n.notes,
               'temperature_c', n.temperature_c, 'pallet_exchange', n.pallet_exchange,
               'direction', plan_h_dir_side(n.direction), 'pallets', n.pallets),
    'shipments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'shipment_id', s.id, 'origin_location_id', s.origin_location_id, 'dest_location_id', s.dest_location_id,
               'pallets', s.pallets, 'load_from', s.load_from, 'load_to', s.load_to,
               'deliver_from', s.deliver_from, 'deliver_to', s.deliver_to,
               'vs_locked', s.order_stop_id is not null,
               'rides', exists (select 1 from piece_legs l join shipment_pieces pp on pp.id = l.piece_id
                                 where pp.shipment_id = s.id and l.deleted_at is null),
               'rt_codes', coalesce((select jsonb_agg(distinct r.code order by r.code)
                                       from piece_legs l join shipment_pieces pp on pp.id = l.piece_id
                                       join ct_round_trips r on r.id = l.rt_id
                                      where pp.shipment_id = s.id and l.deleted_at is null and pp.deleted_at is null
                                        and r.model = 2 and r.status <> 'cancelled' and r.code is not null), '[]'::jsonb))
             order by s.id)
        from shipments s where s.nat_order_id = n.id and s.deleted_at is null), '[]'::jsonb)), p_role);
end
$f$;
  -- born closed (principle 5: postgres' default ACL gives EXECUTE to PUBLIC); the Worker's read only
  REVOKE ALL ON FUNCTION public.plan_order_read(bigint,text) FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.plan_order_read(bigint,text) TO service_role;

  -- ===== PART 2: plan_order_update = LIVE TEXT + HUNKS (md5 after = measured on the PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_order_update(jsonb,text,text)', ARRAY[h_1a, h_2a, h_3a, h_4a, h_5a], ARRAY[h_1b, h_2b, h_3b, h_4b, h_5b], 'a6c62b6cfc7850cbe5a5d90a64ad6db6')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
       OR NOT p.prosecdef THEN
      RAISE EXCEPTION '077: % is not a SECURITY DEFINER plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '077: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '077: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants (the Worker's EXECUTE)
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text THEN
      RAISE EXCEPTION '077 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  IF NOT has_function_privilege('service_role', 'public.plan_order_update(jsonb,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.plan_order_read(bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '077 proof: the Worker cannot EXECUTE plan_order_update / plan_order_read';
  END IF;
  IF has_function_privilege('anon', 'public.plan_order_read(bigint,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.plan_order_read(bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '077 proof: plan_order_read is open to an API role';
  END IF;
  -- the read refuses by name, never answers an empty order (principle 1)
  v_e := NULL;
  BEGIN
    PERFORM public.plan_order_read(-1, 'owner');
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_e = PG_EXCEPTION_HINT;
  END;
  IF v_e IS DISTINCT FROM 'plan:order_gone' THEN
    RAISE EXCEPTION '077 proof: plan_order_read(-1) answered % (expected plan:order_gone)', coalesce(v_e, 'no refusal');
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '077 proof: triggers % -> % (077 adds none)', v_trg0, v_trg1; END IF;
  -- PostgREST sees the new RPC without a restart (as 074a); a NOTIFY is sent only at COMMIT (the dry run sends none)
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '077 OK: plan_order_read (closed, Worker only), plan_order_update patched (new point, removed point, request_id), triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_order_read(bigint,text)') IS NOT NULL THEN '077 OK' ELSE '077 NOT APPLIED' END AS result,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS update_md5;
