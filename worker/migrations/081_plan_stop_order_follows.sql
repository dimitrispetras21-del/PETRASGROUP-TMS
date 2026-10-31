-- 081 - NATIONAL v5: THE STOPS OF A CYCLE GO BY THE ROAD (F28), THE TRUCK'S STOP FOLLOWS ITS POINT (F30 follow-up).
-- Owner 31/10: "the most correct - and always check that no other problem is created".
-- F28: since 28/10 every point without an hour is 00:00-23:59, so the stops of one day share one planned_from and
--   plan_h_reseq broke the tie by the old seq = the order of entry. RT-1300 (ANODOS 27/10): 386 Aspropyrgos ->
--   778 Alexandria -> 904 Dimini -> 541 Kopanos; the road is 386 -> 904 -> 778 -> 541 (the truck went north, back
--   south, north again). Every write that adds or moves stops ends in plan_h_reseq (plan_h_put after its legs, also
--   for a NEW cycle; plan_move_pieces, plan_delete, plan_h_bridge_drop, plan_h_vs_repoint, plan_rt_update), so ONE
--   function holds the rule (principle 3); plan_rt_create's numbering is provisional and is not touched.
-- F30 follow-up (#170, DECISION_LOG 28/10 "081 ... rejected for now"): the order form changes the day / window of a
--   point that rides a cycle, but the truck's stop stayed; the stop-time change (F29) was a second step.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 077 applied, 081 not applied, the LIVE texts of plan_h_reseq and plan_order_update (md5 of prosrc
--           = production, SELECT 31/10), plan_rt_update (the path 081 calls) its live text, day L set, B-54 = triggers
--   PART 1  plan_h_reseq = live text + 2 hunks. The groups stay: KATHODOS before ANODOS, then planned_from (071
--           side_order / stop_order unchanged, so an hour in a window still decides first). INSIDE a group of the same
--           side and the same planned_from: the road, as a straight line from the stop before (a cycle's first group:
--           from the hub going down, from the farthest from the hub coming up), the nearest next. Stops within 15 km
--           of the nearest one are one place (a town) and keep the dispatcher's order - the order of an
--           international's unloadings, RT-1306 in Athens; places farther apart never tie on entry order. A drop
--           never before its own pickup (071 leg_order). A place without coordinates after the others of its group,
--           in entry order. A group with an EXECUTED stop keeps the order
--           it ran in: history is not re-sequenced.
--   PART 2  plan_order_update = live text + 5 hunks. A point whose load or delivery window changed takes the truck's
--           stop with it in the same save (the stop that loads it at its origin / unloads it at its destination; never
--           a hub stop). Only when that stop serves this point alone, is not executed and its cycle has one vehicle
--           segment. Otherwise the stop stays and the answer says why (warning stop_kept: shared + the other points /
--           windows_differ / executed / handover). A save that changes a window locks the order's cycles first,
--           before the order row (the one lock order of plan_*), so the "shared" read cannot be overtaken. The move
--           is plan_rt_update itself (the F29 path): truck_busy, payroll lock, local loading day, pallet rows, VS day,
--           reseq and 071's stop_order / side_order / leg_order. A rule the move breaks undoes only the move (a
--           savepoint): the point is saved, the stop stays, stop_kept names the rule (owner 31/10 "loose rules now,
--           strict later": nothing that passed before 081 is refused because of it).
--   PART 3  proofs, NOTICE "081 OK: ..."
-- No table, no column, no trigger, no grant, no row written. No Worker change (PATCH /plan/orders/:id passes the
-- answer as it is; every role with orders PATCH has rt PATCH in PLAN_PERMS). Existing cycles are NOT re-sequenced
-- here: a cycle takes the new order at its next write (audit row per stop), its executed days never.
-- 082 (executed 31/10, PR #177) patched plan_h_bridge_unplan and rt_sync_from_order: no function in common with 081.
-- RUN: after 15:00 or with the owner's explicit yes: 081_plan_stop_order_follows_dryrun.sql, then this file, then
-- 081_plan_stop_order_follows_verify.sql. REVERSE: 081_plan_stop_order_follows_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  r_1a CONSTANT text := $h$declare r record;
$h$;
  r_1b CONSTANT text := $h$declare r record;
  -- 081: the groups, the road walk inside one (v_ord = the final order), the point it starts from
  g record; v_ord bigint[] := '{}'; v_left bigint[]; v_pick bigint; v_la float8; v_lo float8; v_far boolean;
  v_hla float8; v_hlo float8;
$h$;
  r_2a CONSTANT text := $h$  for r in select s.id, s.seq,
                  row_number() over (order by (s.side = 'ANODOS'), s.planned_from, s.seq, s.id) as rn
             from rt_stops s where s.rt_id = p_rt and s.deleted_at is null loop
$h$;
  r_2b CONSTANT text := $h$  -- 081 (F28, owner 31/10): stops of the same side and the same planned_from (every point without an hour is
  -- 00:00-23:59 since 28/10) went by entry order (RT-1300: 386 -> 778 -> 904 -> 541, the road 386 -> 904 -> 778 ->
  -- 541). Inside such a group the order is the road as a straight line: from the stop before (a cycle's first group:
  -- the hub going down, the farthest from the hub coming up) the nearest next. Stops within 15 km OF THAT NEAREST one
  -- are one place (a town): the dispatcher's order stays among them (an international's unloadings in Athens,
  -- RT-1306); two places farther apart never tie, so the result never depends on the order of entry. A drop waits for
  -- its own pickup (071 leg_order); no coordinates = after the others, in entry order. A group with an executed stop
  -- keeps the order it ran in. The groups themselves stay KATHODOS, ANODOS, then planned_from: an hour decides first.
  select latitude::float8, longitude::float8 into v_hla, v_hlo from locations where is_hub;
  for g in select (s.side = 'ANODOS') as up, s.planned_from, array_agg(s.id order by s.seq, s.id) as ids,
                  bool_or(c.status <> 'cancelled' and (s.planned_to at time zone 'Europe/Athens')::date
                          < (now() at time zone 'Europe/Athens')::date) as ran
             from rt_stops s join ct_round_trips c on c.id = s.rt_id
            where s.rt_id = p_rt and s.deleted_at is null
            group by 1, 2 order by 1, 2 loop
    if g.ran or cardinality(g.ids) = 1 then
      v_ord := v_ord || g.ids;
      continue;
    end if;
    v_left := g.ids;
    while cardinality(v_left) > 0 loop
      if cardinality(v_ord) > 0 then
        select l.latitude::float8, l.longitude::float8 into v_la, v_lo
          from rt_stops s join locations l on l.id = s.location_id where s.id = v_ord[cardinality(v_ord)];
        v_far := false;
      else
        v_la := v_hla; v_lo := v_hlo; v_far := g.up;
      end if;
      v_pick := null;
      -- k: km from the point the walk stands on (negative = the farthest first); n: the nearest one, the town's centre
      with c as (
        select s.id, s.seq, l.latitude::float8 as la, l.longitude::float8 as lo,
               (case when v_far then -1 else 1 end)
               * 2 * 6371 * asin(least(1, sqrt(power(sin(radians(l.latitude::float8 - v_la) / 2), 2)
                   + cos(radians(v_la)) * cos(radians(l.latitude::float8))
                     * power(sin(radians(l.longitude::float8 - v_lo) / 2), 2)))) as k
          from rt_stops s join locations l on l.id = s.location_id
         where s.id = any (v_left)
           and not exists (select 1 from piece_legs lg where lg.drop_stop_id = s.id and lg.deleted_at is null
                             and lg.pickup_stop_id <> s.id and lg.pickup_stop_id = any (v_left))),
      n as (select c.la, c.lo from c where c.k is not null order by c.k, c.seq, c.id limit 1)
      select c.id into v_pick from c left join n on true
       order by (c.k is null),
                (n.la is null or 2 * 6371 * asin(least(1, sqrt(power(sin(radians(c.la - n.la) / 2), 2)
                   + cos(radians(n.la)) * cos(radians(c.la)) * power(sin(radians(c.lo - n.lo) / 2), 2)))) > 15),
                c.seq, c.id limit 1;
      -- a drop whose pickup is also waiting in the group, both ways: 071 refuses it at the end, as before 081
      v_pick := coalesce(v_pick, v_left[1]);
      v_ord := v_ord || v_pick;
      v_left := array_remove(v_left, v_pick);
    end loop;
  end loop;
  for r in select s.id, s.seq, o.n as rn
             from unnest(v_ord) with ordinality o(id, n) join rt_stops s on s.id = o.id loop
$h$;
  o_1a CONSTANT text := $h$  v_new_sh bigint[] := '{}'; v_new_pc bigint[] := '{}'; v_rm bigint[] := '{}';
$h$;
  o_1b CONSTANT text := $h$  v_new_sh bigint[] := '{}'; v_new_pc bigint[] := '{}'; v_rm bigint[] := '{}';
  -- 081: the windows that changed (v_win), the stops moved / kept, what plan_rt_update answered
  v_win jsonb := '[]'::jsonb; v_moved jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_mv jsonb := '{}'::jsonb;
  v_wn jsonb := '[]'::jsonb; v_nt jsonb := '[]'::jsonb; v_ru jsonb; v_oth jsonb; v_why text; v_rtid bigint; y record;
  v_hint text; v_msg text; v_code text; v_det text;
$h$;
  o_2a CONSTANT text := $h$    perform plan_h_resize(a.id, b.pallets - a.pallets, p_actor, p_role);
$h$;
  o_2b CONSTANT text := $h$    perform plan_h_resize(a.id, b.pallets - a.pallets, p_actor, p_role);
    -- 081: a changed window of a point; its truck's stop follows after the loop, when every point is saved
    if (a.load_from, a.load_to) is distinct from (b.load_from, b.load_to) then
      v_win := v_win || jsonb_build_object('sh', a.id, 'k', 'load', 'f', b.load_from, 't', b.load_to);
    end if;
    if (a.deliver_from, a.deliver_to) is distinct from (b.deliver_from, b.deliver_to) then
      v_win := v_win || jsonb_build_object('sh', a.id, 'k', 'drop', 'f', b.deliver_from, 't', b.deliver_to);
    end if;
$h$;
  o_3a CONSTANT text := $h$  v_sum := plan_h_order_summary($h$;
  o_3b CONSTANT text := $h$  -- 081 (owner 31/10, F30 follow-up): the truck's stop follows its point in this same save - the stop that loads
  -- the point at its origin, the stop that unloads it at its destination (never a hub stop: not the point's window).
  -- Only a stop that serves THIS point alone (or points of this save moved to the same window), not executed, on a
  -- cycle with one vehicle segment. Otherwise it stays and the answer says why (stop_kept): 'executed' (history),
  -- 'shared' (the other points are named: one point does not move another's truck stop; the stop-time change of
  -- F29 moves it for all, with its own preview), 'windows_differ' (points of this save ask it different windows),
  -- 'handover' (the move could cut a handover: list + token, F29).
  -- The move is plan_rt_update, the one path of a stop's time (truck_busy, payroll lock, local loading day, pallet
  -- rows, VS day, reseq, 071 stop_order / side_order / leg_order). A rule the MOVE breaks undoes only the move: the
  -- point keeps its new window, the stop stays where it was (every rule still true) and stop_kept names the rule -
  -- owner 31/10 "loose rules now, strict later": a save that passed before 081 is never refused because of 081.
  -- (the cycles were locked at the start, o_5b: an assignment onto the same stop cannot slip in before the move)
  for y in
    select s.id as stop_id, s.rt_id, c.code, c.status, s.planned_from, s.planned_to,
           array_agg(distinct w.sh order by w.sh) as mine,
           count(distinct w.f::text || '|' || w.t::text) as wins, min(w.f) as f, min(w.t) as t
      from jsonb_to_recordset(v_win) w(sh bigint, k text, f timestamptz, t timestamptz)
      join shipments sh on sh.id = w.sh
      join shipment_pieces sp on sp.shipment_id = w.sh and sp.deleted_at is null
      join piece_legs l on l.piece_id = sp.id and l.deleted_at is null
      join rt_stops s on s.id = case when w.k = 'load' then l.pickup_stop_id else l.drop_stop_id end
                     and s.deleted_at is null
                     and s.location_id = case when w.k = 'load' then sh.origin_location_id else sh.dest_location_id end
      join ct_round_trips c on c.id = s.rt_id
     group by s.id, s.rt_id, c.code, c.status, s.planned_from, s.planned_to
     order by s.rt_id, s.id
  loop
    if y.wins = 1 and (y.planned_from, y.planned_to) = (y.f, y.t) then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('shipment_id', x2.id, 'nat_order_id', x2.nat_order_id,
                                                 'order_id', x2.order_id) order by x2.id), '[]'::jsonb)
      into v_oth
      from shipments x2
     where x2.id <> all (y.mine)
       and x2.id in (select sp2.shipment_id from piece_legs l2 join shipment_pieces sp2 on sp2.id = l2.piece_id
                      where l2.deleted_at is null and y.stop_id in (l2.pickup_stop_id, l2.drop_stop_id));
    v_why := case
      when y.status <> 'cancelled' and (y.planned_to at time zone 'Europe/Athens')::date
                                       < (now() at time zone 'Europe/Athens')::date then 'executed'
      when jsonb_array_length(v_oth) > 0 then 'shared'
      -- points of this same save ask the one stop for different windows: which one would it take?
      when y.wins > 1 then 'windows_differ'
      when (select count(*) from rt_vehicle_segments g where g.rt_id = y.rt_id and g.deleted_at is null) > 1 then 'handover'
    end;
    if v_why is not null then
      v_kept := v_kept || jsonb_build_object('code', 'stop_kept', 'reason', v_why, 'stop_id', y.stop_id, 'rt_id', y.rt_id,
                                             'rt_code', y.code, 'shipment_ids', to_jsonb(y.mine), 'others', v_oth);
    else
      v_mv := jsonb_set(v_mv, array[y.rt_id::text], coalesce(v_mv->(y.rt_id::text), '[]'::jsonb)
                || jsonb_build_object('stop_id', y.stop_id, 'planned_from', y.f, 'planned_to', y.t));
      v_moved := v_moved || jsonb_build_object('stop_id', y.stop_id, 'rt_id', y.rt_id, 'rt_code', y.code,
                   'shipment_ids', to_jsonb(y.mine),
                   'before', jsonb_build_object('planned_from', y.planned_from, 'planned_to', y.planned_to),
                   'after', jsonb_build_object('planned_from', y.f, 'planned_to', y.t));
    end if;
  end loop;
  -- the rules of this save's own rows fire HERE, outside the block below, so a refusal it catches is the move's alone
  if v_mv <> '{}'::jsonb then perform plan_h_finish(); end if;
  for v_rtid in select k::bigint from jsonb_object_keys(v_mv) k order by 1 loop
    begin
      v_ru := plan_rt_update(jsonb_build_object('rt_id', v_rtid, 'stops', v_mv->(v_rtid::text)), p_actor, p_role);
      v_wn := v_wn || coalesce(v_ru->'warnings', '[]'::jsonb);
      v_nt := v_nt || coalesce(v_ru->'notice_ids', '[]'::jsonb);
    exception when check_violation then
      get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
      if coalesce(v_hint, '') not like 'plan:%' then raise; end if;
      -- the block's savepoint undid the move of this cycle's stops; they stay, said with the rule and its detail
      v_code := substr(v_hint, 6);
      v_det := case when strpos(v_msg, v_code || ':') > 0
                    then nullif(substr(v_msg, strpos(v_msg, v_code || ':') + length(v_code) + 1), '') end;
      v_kept := v_kept || coalesce((select jsonb_agg(jsonb_build_object('code', 'stop_kept', 'reason', v_code, 'detail', v_det,
                                      'stop_id', e->'stop_id', 'rt_id', v_rtid, 'rt_code', e->'rt_code',
                                      'shipment_ids', e->'shipment_ids', 'others', '[]'::jsonb))
                                      from jsonb_array_elements(v_moved) e where (e->>'rt_id')::bigint = v_rtid), '[]'::jsonb);
      v_moved := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_moved) e where (e->>'rt_id')::bigint <> v_rtid),
                          '[]'::jsonb);
    end;
  end loop;
  v_sum := plan_h_order_summary($h$;
  o_5a CONSTANT text := $h$  select * into n from national_orders where id = (p->>'nat_order_id')::bigint for no key update;
$h$;
  o_5b CONSTANT text := $h$  -- 081: a save that changes a window may move truck stops (below): the cycles this order rides are locked FIRST, by
  -- id, before the order row, any point or piece is written and before "who else stops there" is read - the one lock
  -- order of every plan_* (plan_delete: cycles, then the national order; plan_put_pieces: cycle, then pieces), and an
  -- assignment onto the same stop waits for this save instead of slipping in between the read and the move. A save
  -- without a window change locks nothing new.
  if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p->'shipments') = 'array' then p->'shipments' end) e
              where jsonb_typeof(e) = 'object' and e ?| array['load_from', 'load_to', 'deliver_from', 'deliver_to']) then
    perform 1 from ct_round_trips c
     where c.id in (select l.rt_id from shipments sh join shipment_pieces sp on sp.shipment_id = sh.id
                      join piece_legs l on l.piece_id = sp.id
                     where sh.nat_order_id = (p->>'nat_order_id')::bigint and sh.deleted_at is null and l.deleted_at is null)
     order by c.id for no key update;
  end if;
  select * into n from national_orders where id = (p->>'nat_order_id')::bigint for no key update;
$h$;
  o_4a CONSTANT text := $h$             'removed_shipment_ids', to_jsonb(v_rm)), null, null);
$h$;
  o_4b CONSTANT text := $h$             'removed_shipment_ids', to_jsonb(v_rm), 'stops_moved', v_moved), v_kept || v_wn, v_nt);
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_order_read(bigint,text)') IS NULL THEN
    RAISE EXCEPTION '081: 077 is not applied (order 077 -> 081) - stop';
  END IF;
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '081: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_reseq(bigint,text,text)', '14322e7190d6431cc11c267f49bb5735'),
      ('public.plan_order_update(jsonb,text,text)', '39d38711b825e3ba698a814aeb53bbcc')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '081: % is not its live text of 31/10 (081 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  -- the path 081 calls: the stop-time change of F29 as production holds it (072b); its rules are the ones 081 keeps
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.plan_rt_update(jsonb,text,text)'))
     IS DISTINCT FROM 'be70612fb940356278c7c66705c8ee33' THEN
    RAISE EXCEPTION '081: plan_rt_update is not its live text of 31/10 - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '081: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;
  -- ===== PART 1 + PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_reseq(bigint,text,text)', ARRAY[r_1a, r_2a], ARRAY[r_1b, r_2b], 'f246c362c3f3bb1746a1d536ad1338bb'),
      ('public.plan_order_update(jsonb,text,text)', ARRAY[o_1a, o_2a, o_3a, o_4a, o_5a], ARRAY[o_1b, o_2b, o_3b, o_4b, o_5b], '323eb4ccde77d1848c74a8b4ab310021')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '081: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '081: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '081: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '081 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '081 proof: triggers % -> % (081 adds none)', v_trg0, v_trg1; END IF;
  -- the stop move goes through the one path of a stop's time, never a second copy of its rules
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) NOT LIKE '%plan_rt_update(%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) LIKE '%update rt_stops%' THEN
    RAISE EXCEPTION '081 proof: plan_order_update does not move stops through plan_rt_update alone';
  END IF;
  RAISE NOTICE '081 OK: plan_h_reseq orders a same-time group by the road, plan_order_update moves a point''s own stop, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure) AS reseq_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS order_update_md5;
