-- 082 - NATIONAL v5: A DATE CHANGE OF THE INTERNATIONAL NEVER TAKES A CYCLE AWAY (F40), A CLOSED RT KEEPS ITS DATES (F41).
-- EXECUTED 31/10/2026 by the owner: dry run '082 ran: unplan b4450bcd..., sync 1a1c3578...', then this file; verify
--   '082 in place', changed_texts 0, unplan_drops false, recompute_untouched true (files out of drafts/, rule 5).
-- Found in the owner's real-user entry of W44 (28/10/2026, audit 17:07-20:11 UTC):
-- F40: VS 576 (Import, 3 unloadings) rode cycle RT-1304. The owner moved its delivery 28 -> 27 in the INTERNATIONAL
--   form. order_dates_follow moved the 3 unloading stops, plan_bridge_on_stop saw a national-side stop change day and
--   called plan_h_bridge_unplan once per stop: 3 legs and 4 rt_stops deleted, RT-1304 cancelled (empty, no documents),
--   3 identical notices "... ta kommatia xanavgikan PROS ANATHESI". The form warned nobody; the new assignment got a
--   new code (RT-1306). The owner (28/10): a cycle NEVER disappears without the user knowing and choosing it.
--   Same at 20:32 UTC on VS 601 (delivery 29 -> 31): leg 32 and rt_stops 60/61 of RT-1305 deleted, notice 8.
-- F41: every save of 576 moved RT-1252 (international, CLOSED 27/10) date_end 22 -> 27 (rt_sync_from_order ->
--   rt_recompute, trigger:rt_sync: the largest delivery of its legs) and 9 s later back to 22 (core/rt-feed.js: the
--   export's own delivery, PATCH /costs/rt). Two writers, two rules (principle 3); 102 such pairs on 58 RT in 30 days,
--   5 on closed. The front end stops writing dates of an existing RT in the same PR; this file makes a closed RT's
--   dates history for the order-date path.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 077 applied (the last v5 migration that ran before this one), 082 not applied, the LIVE texts of
--           plan_h_bridge_unplan and rt_sync_from_order (md5 of prosrc = production, SELECT 28/10 and 31/10), day L
--           set, B-54 = the enabled triggers
--   PART 1  plan_h_bridge_unplan = live text + 5 hunks: a bridge whose pieces ride a cycle KEEPS its legs, stops and
--           split (nothing deleted, no cycle cancelled); the national desk gets ONE notice per request
--           (vs_day_moved_kept: the VS and the codes of its cycles, "check the times of the stops"). A bridge that
--           rides nothing is unplanned as before (its split undone). Each notice of this function once per request
--           (same kind, same order, same transaction): the 3 identical notices of F40 become 1. (The form's follow-up
--           PATCH of the stops rewrites the same times - audit 28/10 - so it starts no second unplan; a stop time the
--           user really changes in a later request is a second change and is told again.)
--   PART 2  rt_sync_from_order = live text + 1 hunk: a date or vehicle save of an order no longer re-dates a closed
--           (or complete) RT whose legs are all Delivered/Cancelled; a person still changes its dates (TRIP PnL).
--           rt_recompute itself is NOT changed: a leg that joins or leaves (rt_sync_legs, rt_merge of 037) still
--           re-dates the RT, and an order that is no longer Delivered re-dates it before 046 reopens it.
--   PART 3  proofs, NOTICE "082 OK: ..."
-- No table, no column, no trigger, no grant, no row written. No Worker change (the board reads plan_notices as is).
-- 080 (PR #173) and 081 touch other functions; any order between them is fine.
-- RUN: after 15:00 or with the owner's explicit yes: 082_plan_bridge_keeps_cycles_dryrun.sql, then this file, then
-- 082_plan_bridge_keeps_cycles_verify.sql. REVERSE: 082_plan_bridge_keeps_cycles_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  u_1a CONSTANT text := $h$declare v_sh bigint[]; v_legs bigint[]; v_ref text; v_done boolean := false; x record;
$h$;
  u_1b CONSTANT text := $h$declare v_sh bigint[]; v_ref text; v_done boolean := false; x record;
  -- 082: the bridges that ride a cycle (kept) and those that do not (unplanned as before); the cycles named
  v_keep bigint[]; v_free bigint[]; v_rts text; v_rt bigint; v_n int;
$h$;
  u_2a CONSTANT text := $h$  if exists (select 1 from unnest(v_sh) q where plan_h_bridge_executed(q)) then
    perform plan_h_notice('natl', 'vs_changed_after_execution',
$h$;
  u_2b CONSTANT text := $h$  if exists (select 1 from unnest(v_sh) q where plan_h_bridge_executed(q)) then
    -- 082: one notice per save, not one per stop (plan_bridge_on_stop calls this once per moved stop, then
    -- plan_bridge_on_order once more); created_at = now() = this transaction
    if not exists (select 1 from plan_notices where order_id = p_order and kind = 'vs_changed_after_execution'
                    and created_at = now()) then
    perform plan_h_notice('natl', 'vs_changed_after_execution',
$h$;
  u_3a CONSTANT text := $h$      array[v_ref, p_reason], p_order, null, null, p_actor, p_role);
    return;
  end if;
$h$;
  u_3b CONSTANT text := $h$      array[v_ref, p_reason], p_order, null, null, p_actor, p_role);
    end if;
    return;
  end if;
$h$;
  u_4a CONSTANT text := $h$  select coalesce(array_agg(l.id order by l.id), '{}') into v_legs
    from piece_legs l join shipment_pieces sp on sp.id = l.piece_id
   where sp.shipment_id = any (v_sh) and l.deleted_at is null;
  if cardinality(v_legs) > 0 then
    perform plan_h_bridge_drop(v_legs, p_reason, p_actor, p_role);
    v_done := true;
  end if;
$h$;
  u_4b CONSTANT text := $h$  -- 082 (F40, owner 28/10): a date change of the international never takes a piece off its cycle. Before
  -- 082 the legs were dropped here and an emptied cycle cancelled (RT-1304, 28/10): the cycle vanished and nobody
  -- chose it. Now the legs, stops and split of a riding bridge stay as the dispatcher left them and the national
  -- desk is told once which cycles to check; moving the stops or taking the pieces off is the dispatcher's own act
  -- on the board. A bridge that rides nothing is unplanned as before (its split undone, its pallets the stop's).
  select coalesce(array_agg(q order by q) filter (where rides), '{}'), coalesce(array_agg(q order by q) filter (where not rides), '{}')
    into v_keep, v_free
    from (select q, exists (select 1 from piece_legs l join shipment_pieces sp on sp.id = l.piece_id
                             where sp.shipment_id = q and l.deleted_at is null) as rides
            from unnest(v_sh) q) t;
  if cardinality(v_keep) > 0 and not exists (select 1 from plan_notices where order_id = p_order
                                               and kind = 'vs_day_moved_kept' and created_at = now()) then
    -- every cycle of the order's live bridges, not only this stop's: the first call of a request names them all
    -- (the later calls of the same request are deduplicated, so naming only this stop's would lose the others)
    select string_agg(distinct r.code, ', ' order by r.code), min(r.id), count(distinct r.id) into v_rts, v_rt, v_n
      from piece_legs l join shipment_pieces sp on sp.id = l.piece_id join shipments s on s.id = sp.shipment_id
      join ct_round_trips r on r.id = l.rt_id
     where s.order_id = p_order and s.order_stop_id is not null and s.deleted_at is null and l.deleted_at is null;
    -- "O diethnon allaxe imerominia tis VS %s: ta kommatia EMEINAN ston kyklo tous (%s), elegxe tis ores ton staseon"
    perform plan_h_notice('natl', 'vs_day_moved_kept',
      'zp8gzrTOuc61zrjOvc+Ozr0gzqzOu867zrHOvs61IM63zrzOtc+Bzr/OvM63zr3Or86xIM+EzrfPgiBWUyAlczogz4TOsSDOus6/zrzOvM6sz4TOuc6xIM6VzpzOlc6Zzp3Okc6dIM+Dz4TOv869IM66z43Ous67zr8gz4TOv8+Fz4IgKCVzKSwgzq3Ou861zrPOvs61IM+EzrnPgiDPjs+BzrXPgiDPhM+Jzr0gz4PPhM6sz4POtc+Jzr0=',
      array[v_ref, coalesce(v_rts, '-')], p_order, null, case when v_n = 1 then v_rt end, p_actor, p_role);
  end if;
  v_sh := v_free;
$h$;
  u_5a CONSTANT text := $h$  if v_done then
$h$;
  u_5b CONSTANT text := $h$  if v_done and not exists (select 1 from plan_notices where order_id = p_order and kind = 'vs_day_moved'
                                and created_at = now()) then
$h$;
  s_1a CONSTANT text := $h$    perform rt_recompute(leg.rt_id);
  end loop;
  return null;
$h$;
  s_1b CONSTANT text := $h$    -- 082 (F41, owner 28/10): the dates of a closed round trip are history - its P&L, its payroll week. A save
    -- of one of its orders re-dated it every time (RT-1252, 28/10: 22 -> 27 -> 22 three times). A person still
    -- changes them (TRIP PnL). Only this path: a leg that joins or leaves still re-dates (rt_sync_legs, rt_merge),
    -- and an order that is no longer Delivered re-dates it here, before 046 reopens it (046's rule of open).
    if not (rt.status in ('closed', 'complete') and not exists (
         select 1 from ct_rt_legs l2 left join orders o2 on o2.id = l2.order_id
           left join national_loads nl2 on nl2.id = l2.nat_load_id
          where l2.rt_id = leg.rt_id and coalesce(o2.deleted_at, nl2.deleted_at) is null
            and coalesce(o2.status, nl2.status) is distinct from 'Delivered'
            and coalesce(o2.status, nl2.status) is distinct from 'Cancelled')) then
      perform rt_recompute(leg.rt_id);
    end if;
  end loop;
  return null;
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_order_read(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '082: 077 is not applied (order 077 -> 082) - stop';
  END IF;
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '082: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_bridge_unplan(bigint,bigint,text,text,text)', '104f50467bfe6bc1ec2cd747d92943b7'),
      ('public.rt_sync_from_order()', '68d7a46e020c13a6b5a6edbd5578c985')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '082: % is not its live text of 28/10 (082 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '082: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1 + PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_bridge_unplan(bigint,bigint,text,text,text)', ARRAY[u_1a, u_2a, u_3a, u_4a, u_5a], ARRAY[u_1b, u_2b, u_3b, u_4b, u_5b], 'b4450bcd533afcb24348e8f46e914276'),
      ('public.rt_sync_from_order()', ARRAY[s_1a], ARRAY[s_1b], '1a1c357803bc1c0c7368e1ba5b1335cc')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '082: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '082: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '082: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '082 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '082 proof: triggers % -> % (082 adds none)', v_trg0, v_trg1; END IF;
  -- a riding bridge is never dropped by unplan any more: the text holds no call of plan_h_bridge_drop
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_h_bridge_unplan(bigint,bigint,text,text,text)'::regprocedure) LIKE '%plan_h_bridge_drop(%' THEN
    RAISE EXCEPTION '082 proof: plan_h_bridge_unplan still drops legs';
  END IF;
  RAISE NOTICE '082 OK: plan_h_bridge_unplan keeps riding bridges (one notice per request), rt_sync_from_order leaves closed RT dates, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_bridge_unplan(bigint,bigint,text,text,text)'::regprocedure) AS unplan_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_sync_from_order()'::regprocedure) AS sync_md5;
