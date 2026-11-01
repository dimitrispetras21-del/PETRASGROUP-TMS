-- 087 - NATIONAL v5: THE BOARD SAYS WHAT CHANGED, WHICH WEEKS WAIT, WHAT A ROUTE PAID; ONE PLACE PER PIECE AT VEROIA.
-- Pack 4 of the Weekly National (coordinator 1/11), four owner items in ONE change of plan_board + plan_move_pieces:
--   P-16  the last change of a cycle after its assignment (flexible-rules study, decision 8: only the LAST one, time,
--         role, what - never a history; E-11 "g" stays). The board reads it from audit_log, never the screen
--         (principle 3); /audit stays owner / management only - this answers a role, never a name.
--   A-3   orders waiting per week, for a badge on the week tabs ("W45 3"): the board reads one week, the tabs see seven.
--   P-8   the partner rates of the last cycles with a first and a last place, for "the last 3 rates of this route" in
--         the assignment form.
--   P-11  owner 28/10, answer 1 of the Veroia panel study (PR #167): a VS import starts ONLY as "PROS ANATHESI"; the
--         dispatcher sends it to the panel, and it leaves the Weekly; "<- Weekly" sends it back. ONE mark,
--         shipment_pieces.for_split_at (074a): plan_move_pieces gets target {hub: true | false} for a piece that
--         stands at Veroia with no leg (the existing target.wait needs a live leg).
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 086 applied (plan_move_pieces = its text; order 083 -> 084 -> 086 -> 087), 087 not applied, the
--           LIVE text of plan_board (086 does not touch it), day L set, B-54 = the enabled triggers
--   PART 1  one closed helper (born closed, principle 5): plan_h_last_change(rt) - the newest audit_log row written
--           by a person (not 'system', not a trigger or a migration) on the cycle, its stops, legs, vehicle segments,
--           or on the shipments / national orders its legs carry, AFTER the cycle was created (its creating request is
--           the assignment itself). Answers {at, role, table, action, keys}: keys = the names whose value changed
--           (never the values: no amount reaches a role through it). 086's accepted overlaps are rt_vehicle_segments
--           updates by a person: they show, as they are a change.
--   PART 2  plan_board = live text + 2 hunks: cycles[].last_change; top level waiting_weeks (the seven weeks around
--           p_week, orders not yet on a truck by their ready day - the rows of PROS ANATHESI: waiting off Veroia,
--           and at Veroia neither stock nor unloaded by a cycle nor sent to the panel) and rate_history (the last
--           100 PARTNER v5 cycles with a rate, 90 days back: partner, rate, day, first and last place per side)
--           plan_move_pieces = 086's text + 1 hunk: target {hub: true | false}, from {piece_ids}: each piece must be
--           live, not split, at Veroia and waiting, not stock; true sets for_split_at, false clears it; a piece
--           already so is left as it is; one audit row per changed piece. No dry run, no token (it moves nothing).
--   PART 3  proofs, NOTICE "087 OK: ..."
-- No table, no column, no trigger, no row written. No Worker change: GET /plan/board and POST /plan/move forward
-- the answer and the body as they are; partner_rate is no PLAN_MONEY_KEYS key (decision 41: every role sees it).
-- 088 (plan_split_piece, PR #194) and 089 touch other functions.
-- RUN: after 083, 084, 086; after 15:00 or with the owner's explicit yes: 087_plan_board_reads_hub_mark_dryrun.sql,
-- then this file, then 087_plan_board_reads_hub_mark_verify.sql. REVERSE: 087_plan_board_reads_hub_mark_rollback.sql
-- (marks already set or cleared stay: they are what the users did).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  b_1a CONSTANT text := $h$               || jsonb_build_object('partner_rate', r.partner_rate, 'segments', plan_h_seg_json(vc.rt_id)) as j  -- 072b: the segments
$h$;
  b_1b CONSTANT text := $h$               || jsonb_build_object('partner_rate', r.partner_rate, 'segments', plan_h_seg_json(vc.rt_id))
               -- 087 (P-16): the last change after the assignment, one row, never a history
               || jsonb_build_object('last_change', plan_h_last_change(vc.rt_id)) as j  -- 072b: the segments
$h$;
  b_2a CONSTANT text := $h$    -- decision 40 (changed with 41): the unread natl notices for every role, as PLAN_PERMS notices
$h$;
  b_2b CONSTANT text := $h$    -- 087 (A-3): orders not yet on a truck, by the TMS week (Saturday) of their ready day, for the seven week
    -- tabs around p_week; the rows of PROS ANATHESI: waiting off Veroia, and at Veroia neither stock nor unloaded by a
    -- cycle nor sent to the panel (core/wn5-logic.js _neverAssigned: one rule, the board's own fields). A row the board
    -- carries into this week (ready before it, or with no ready day: coalesce(nat_ready_day, p_week)) counts in THIS
    -- week (Athens today), where the dispatcher sees it, never only on a past tab.
    'waiting_weeks', coalesce((
      with td as (select (now() at time zone 'Europe/Athens')::date as d)
      select jsonb_agg(jsonb_build_object('week', q.wk, 'orders', q.n) order by q.wk)
        from (select w.wk, count(distinct w.o) as n
                from (select greatest(x.day - ((extract(isodow from x.day)::int + 1) % 7),
                                      td.d - ((extract(isodow from td.d)::int + 1) % 7)) as wk, x.o
                        from (select coalesce(ps.nat_ready_day, td.d) as day,
                                     coalesce('n' || ps.nat_order_id, 'o' || ps.order_id, 'p' || ps.piece_id) as o
                                from v_piece_state ps cross join td
                               where ps.waiting and not ps.at_hub
                              union all
                              select coalesce(hb.nat_ready_day, td.d),
                                     coalesce('n' || hb.nat_order_id, 'o' || hb.order_id, 'p' || hb.piece_id)
                                from v_hub_bucket hb join shipment_pieces sp on sp.id = hb.piece_id cross join td
                               where hb.is_stock is not true and hb.inbound_rt_id is null and sp.for_split_at is null) x
                       cross join td) w
               where w.wk between p_week - 21 and p_week + 21
               group by w.wk) q), '[]'::jsonb),
    -- 087 (P-8): the last PARTNER v5 cycles with a rate (90 days back), the first and last place of EACH side (a cycle
    -- with both sides starts and ends at Veroia): the assignment form shows the last 3 of the route it assigns (every
    -- role sees a partner rate, decision 41)
    'rate_history', coalesce((
      select jsonb_agg(x.j order by x.d desc, x.id desc)
        from (select r.id, vc.date_start as d,
                     jsonb_build_object('rt_id', r.id, 'partner_id', r.partner_id, 'partner', pa.company_name,
                       'partner_rate', r.partner_rate, 'date_start', vc.date_start,
                       'sides', (select coalesce(jsonb_agg(jsonb_build_object('side', q.side, 'from_location_id', q.f,
                                                                              'to_location_id', q.t) order by q.side desc), '[]'::jsonb)
                                   from (select s.side, (array_agg(s.location_id order by s.seq))[1] as f,
                                                (array_agg(s.location_id order by s.seq desc))[1] as t
                                           from rt_stops s where s.rt_id = r.id and s.deleted_at is null group by s.side) q)) as j
                from ct_round_trips r
                join v_rt_cycle vc on vc.rt_id = r.id
                left join partners pa on pa.id = r.partner_id
               where r.model = 2 and r.trip_type = 'PARTNER' and r.partner_rate is not null and r.status <> 'cancelled'
                 and vc.date_start between p_week - 90 and p_week + 6
               order by vc.date_start desc, r.id desc
               limit 100) x), '[]'::jsonb),
    -- decision 40 (changed with 41): the unread natl notices for every role, as PLAN_PERMS notices
$h$;
  m_1a CONSTANT text := $h$  perform plan_h_keys(p, array['from', 'target', 'stops', 'dry_run', 'confirm_token'], 'p');
$h$;
  m_1b CONSTANT text := $h$  perform plan_h_keys(p, array['from', 'target', 'stops', 'dry_run', 'confirm_token'], 'p');
  -- 087 (P-11, owner 28/10 answer 1 of the Veroia panel): a piece standing at Veroia with no leg goes to the panel
  -- (hub: true, the airplane of a VS) or back to PROS ANATHESI (hub: false, "<- Weekly"). ONE mark, for_split_at
  -- (074a): the board's hub[].for_split. Nothing moves, so no dry run and no token; a piece already so stays.
  if jsonb_typeof(p->'target') = 'object' and p->'target' ? 'hub' then
    perform plan_h_keys(p->'target', array['hub'], 'target');
    if jsonb_typeof(p->'target'->'hub') is distinct from 'boolean' or p ? 'stops' or p ? 'dry_run' or p ? 'confirm_token' then
      perform plan_h_raise('bad_input', 'target.hub');
    end if;
    perform plan_h_keys(v_from, array['piece_ids'], 'from');
    if jsonb_typeof(v_from->'piece_ids') is distinct from 'array' then perform plan_h_raise('bad_input', 'from'); end if;
    select array_agg(distinct x::bigint order by x::bigint) into v_pieces from jsonb_array_elements_text(v_from->'piece_ids') x;
    if v_pieces is null then perform plan_h_raise('bad_input', 'from.piece_ids'); end if;
    perform 1 from shipment_pieces where id = any (v_pieces) order by id for no key update;
    for v_x in select unnest(v_pieces) loop
      if not exists (select 1 from shipment_pieces where id = v_x and deleted_at is null) then
        perform plan_h_raise('piece_dead', v_x::text);
      end if;
      if exists (select 1 from shipment_pieces where parent_piece_id = v_x and deleted_at is null) then
        perform plan_h_raise('piece_split', v_x::text);
      end if;
      if not exists (select 1 from v_piece_state ps where ps.piece_id = v_x and ps.at_hub and ps.waiting and ps.is_stock is not true) then
        perform plan_h_raise('bad_input', 'target.hub:not waiting at Veroia:' || v_x);
      end if;
      if (select (sp.for_split_at is not null) from shipment_pieces sp where sp.id = v_x) is distinct from ((p->'target'->>'hub')::boolean) then
        perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', v_x::text,
                             (select jsonb_build_object('for_split_at', sp.for_split_at) from shipment_pieces sp where sp.id = v_x),
                             jsonb_build_object('for_split_at', case when (p->'target'->>'hub')::boolean then now() end));
        update shipment_pieces set for_split_at = case when (p->'target'->>'hub')::boolean then now() end where id = v_x;
      end if;
    end loop;
    perform plan_h_finish();
    return plan_h_ok('plan_move_pieces', jsonb_build_object('piece_ids', to_jsonb(v_pieces), 'hub', (p->'target'->>'hub')::boolean),
                     '[]'::jsonb, '[]'::jsonb);
  end if;
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '087: day L is not set (074 / 079) - stop';
  END IF;
  IF to_regprocedure('public.plan_h_last_change(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION '087: plan_h_last_change exists (087 already applied) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_board(date,text)', '670f72f60edcf09f955fb1f6a74143b9'),
      ('public.plan_move_pieces(jsonb,text,text)', '2a8c746b726a9b37f0247166da0ecae5')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '087: % is not the text 087 patches (plan_board live 1/11; plan_move_pieces after 086 - order 083 -> 084 -> 086 -> 087) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '087: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: THE CLOSED HELPER =====
  CREATE FUNCTION public.plan_h_last_change(p_rt bigint) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = public AS $f$
  -- 087 (P-16): the newest change a person made to a cycle after it was created (= assigned). Rows of the cycle, its
  -- stops, legs and vehicle segments (deleted ones too: a removed stop is a change), and of the shipments / national
  -- orders its live legs carry. Machines (role 'system', 'trigger:' / 'migration:' actors) are not a change of plan.
  -- keys = the names whose value differs (a Worker row may hold JSON text, not an object: then none) - no value.
  with r as (select id, created_at from ct_round_trips where id = p_rt),
  ids as (
    select 'ct_round_trips'::text as t, p_rt::text as i
    union all select 'rt_stops', s.id::text from rt_stops s where s.rt_id = p_rt
    union all select 'piece_legs', l.id::text from piece_legs l where l.rt_id = p_rt
    union all select 'rt_vehicle_segments', g.id::text from rt_vehicle_segments g where g.rt_id = p_rt
    union all select distinct 'shipments', sp.shipment_id::text
                from piece_legs l join shipment_pieces sp on sp.id = l.piece_id
               where l.rt_id = p_rt and l.deleted_at is null
    union all select distinct 'national_orders', s.nat_order_id::text
                from piece_legs l join shipment_pieces sp on sp.id = l.piece_id join shipments s on s.id = sp.shipment_id
               where l.rt_id = p_rt and l.deleted_at is null and s.nat_order_id is not null)
  select jsonb_build_object('at', a.created_at, 'role', a.role, 'table', a.table_name, 'action', a.action,
           'keys', coalesce((select jsonb_agg(k.key order by k.key) from (
               select e.key from jsonb_each(case when jsonb_typeof(a.after_data) = 'object' then a.after_data else '{}'::jsonb end) e
                where (case when jsonb_typeof(a.before_data) = 'object' then a.before_data else '{}'::jsonb end)->e.key
                      is distinct from e.value
               union
               select e.key from jsonb_each(case when jsonb_typeof(a.before_data) = 'object' then a.before_data else '{}'::jsonb end) e
                where not ((case when jsonb_typeof(a.after_data) = 'object' then a.after_data else '{}'::jsonb end) ? e.key)) k),
             '[]'::jsonb))
    from audit_log a
    join ids on ids.t = a.table_name and ids.i = a.record_id
    cross join r
   where a.created_at > r.created_at and a.role is distinct from 'system'
     and a.actor not like 'trigger:%' and a.actor not like 'migration:%'
   order by a.created_at desc, a.id desc
   limit 1
$f$;
  REVOKE ALL ON FUNCTION public.plan_h_last_change(bigint) FROM PUBLIC, anon, authenticated, service_role;

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_board(date,text)', ARRAY[b_1a, b_2a], ARRAY[b_1b, b_2b], '0de34e06dab0bb1315ba94c6934ca915'),
      ('public.plan_move_pieces(jsonb,text,text)', ARRAY[m_1a], ARRAY[m_1b], 'ec3b8073dc7d8e3666d89082433553b4')) g(sig, a, b, m) LOOP
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

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '087 proof: triggers % -> % (087 adds none)', v_trg0, v_trg1; END IF;
  IF has_function_privilege('service_role', 'public.plan_h_last_change(bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.plan_h_last_change(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.plan_h_last_change(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION '087 proof: plan_h_last_change is open to an API role (born closed)';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.plan_move_pieces(jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '087 proof: the Worker lost EXECUTE on a plan_* it calls';
  END IF;
  -- the board of the current week answers, with the two new top-level keys
  IF NOT (SELECT b ? 'waiting_weeks' AND b ? 'rate_history'
            FROM (SELECT public.plan_board((now() AT TIME ZONE 'Europe/Athens')::date
                    - ((extract(isodow from (now() AT TIME ZONE 'Europe/Athens')::date)::int + 1) % 7), 'owner') AS b) q) THEN
    RAISE EXCEPTION '087 proof: the board of this week lacks waiting_weeks / rate_history';
  END IF;
  RAISE NOTICE '087 OK: plan_board says last_change / waiting_weeks / rate_history, plan_move_pieces takes target.hub, triggers %', v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure) AS board_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_move_pieces(jsonb,text,text)'::regprocedure) AS move_md5;
