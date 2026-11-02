-- 093 - NATIONAL v5: THE HOURS RULES REFUSE ONLY AN ORDER NO TRUCK CAN DRIVE; THE ANODOS BEFORE THE KATHODOS IS A WARNING.
-- Owner 2/11 ("we relax the rules"; 31/10 "loose rules now, strict after the build"): a dispatcher's judgment call is an
-- amber warning with a trace in the history; only data integrity stays a refusal. P3 of the W50 usability test
-- (docs/national-v5/usability-test-2026-11-02.md section 2): about 90% of the stops are "all day" (00:00-23:59 since
-- 28/10; measured 2/11: 86 of 96 live v5 stops), and the hours rules fired on almost every join.
-- WHAT WAS THERE (SELECT 2/11, production):
--   chain_time (plan_leg_problem, 071): a leg refused when its loading STARTS before the piece's arrival starts - an
--     all-day loading at Veroia on the day of a 16:00-18:00 arrival there (00:00 < 16:00) was refused;
--   stop_order (plan_rt_problem, 071 + 086): a stop that ENDS before a stop ahead of it in seq starts, any two sides.
--     plan_h_reseq numbers KATHODOS before ANODOS (decision 5), so an ANODOS that ran on Tue made every later KATHODOS
--     of the same trip impossible ("put the delivery of 5/11 before 3/11");
--   side_order (plan_rt_problem, 071): an ANODOS stop ahead of a KATHODOS stop in seq (reseq never writes it).
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; the LIVE texts of plan_rt_problem, plan_leg_problem, plan_h_reseq, plan_rt_update,
--           plan_h_put and plan_move_pieces (md5 of prosrc = production 2/11, SELECT 2/11: 086 / 072 / 086 / 089 / 080 /
--           087 wrote them); plan_h_before and
--           plan_h_side_warn not there yet. BEFORE: the live v5 trips and legs the live rules refuse today.
--   PART 1  two new internal functions (no role calls them; the rights of 086's helpers):
--           plan_h_before(a, b): window a ends before window b starts. When either is all day (00:00 to 23:59 of one
--             Athens day) it is compared as a DAY: a's last day before b's first day. Otherwise by the minute. A window
--             may span two days (a night window 22:00-06:00, the order form after group 5 of 2/11): it is never all
--             day, and an all-day stop of either of its days is never before or after it;
--           plan_h_side_warn(rt): [] or ONE warning side_time - an ANODOS stop of the trip that runs before one of its
--             KATHODOS stops (it ends before that KATHODOS starts, or it is ahead of it in seq) - the first pair by seq,
--             the places and windows of both, how many pairs.
--   PART 2  live text + hunks:
--           plan_rt_problem: stop_order between stops of the SAME side only, by plan_h_before (a drop that would end
--             before its own pickup stays refused, with leg_order: integrity); side_order is no longer a refusal;
--           plan_leg_problem: chain_time only when the loading ENDS before the arrival STARTS (plan_h_before), as 086
--             did for stop_order; leg_order (a drop before its own pickup) unchanged;
--           plan_h_reseq: the order is unchanged (KATHODOS, ANODOS, then planned_from, 081 + 086); at its end ONE
--             audit_log row on the trip each time the side_time state changes (into that order, another pair or other
--             windows, or out of it): every write that adds or moves stops ends in plan_h_reseq (plan_h_put,
--             plan_move_pieces, plan_delete, plan_h_bridge_drop, plan_h_vs_repoint, plan_rt_update), so every path
--             leaves the trace;
--           plan_rt_update ("Allagi oras", PATCH /plan/rt/:id and its dry run): side_time in warnings, dry run and save;
--           plan_h_put (every assignment: plan_put_pieces / _group, plan_orders_create, plan_split_piece, a move with a
--             target): side_time of the trip it filled in its warnings;
--           plan_move_pieces: the warnings of its answer read side_time on the trip it filled AFTER its own sweep and
--             reseq (a move within one trip: the stops it left are gone by then), never plan_h_put's earlier view.
--   PART 3  proofs: texts and rights; plan_h_before on literal windows; AFTER: no live trip or leg the new rules refuse
--           that the live rules accepted; NOTICE "093 OK: ..." with the counts before and after.
-- Not here: truck_busy / driver_busy are 086's (accept_busy); 095 patches plan_rt_update after 093 (step 3, its guard is
-- 093's text: order 093 -> 095, coordinator 2/11).
-- No table, no column, no trigger, no grant beyond the two new functions, no row written. No Worker change: the
-- Worker passes warnings as they are, and their texts are the screen's (core/wn5-labels.js, side_time).
-- RUN: after 15:00 or with the owner's explicit yes: 093_plan_hours_relaxed_dryrun.sql, then this file, then
-- 093_plan_hours_relaxed_verify.sql. REVERSE: 093_plan_hours_relaxed_rollback.sql (it STOPS and names the trips if
-- one holds an order 093 allowed: the old rules would refuse its next write).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  o_1a CONSTANT text := $h$  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null and b.planned_to <= a.planned_from) then
    -- 086 (owner 1/11): only a stop that ENDS before the stop ahead of it starts; overlapping windows (an all-day
    -- drop after its own 16:00 loading) are a plan, not an error
    return 'stop_order:' || p_rt;
  end if;
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null
                and a.side = 'ANODOS' and b.side = 'KATHODOS') then
    return 'side_order:' || p_rt;
  end if;
$h$;
  o_1b CONSTANT text := $h$  -- 093 (owner 2/11, "we relax the rules"): stop_order between stops of the SAME side only - a stop that ENDS
  -- before the stop ahead of it starts (086), an all-day window compared as a day (plan_h_before). Between the
  -- KATHODOS and the ANODOS the order is the dispatcher's call: an ANODOS that runs before a KATHODOS of the same trip
  -- (it ends before that KATHODOS starts, or it is ahead of it - 071's side_order) is no longer refused. It is said
  -- (warning side_time, plan_h_side_warn) and traced in audit_log (plan_h_reseq). leg_order stays: integrity.
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq and b.side = a.side
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null
                and plan_h_before(b.planned_from, b.planned_to, a.planned_from, a.planned_to)) then
    return 'stop_order:' || p_rt;
  end if;
$h$;
  c_1a CONSTANT text := $h$  -- it cannot be picked up before it can have arrived
  if prev.id is not null and pk.planned_from < prev.planned_from then return 'chain_time:' || p_leg; end if;
$h$;
  c_1b CONSTANT text := $h$  -- 093 (owner 2/11): it cannot be loaded when its loading ENDS before its arrival STARTS - an order no truck can
  -- drive. Overlapping windows are a plan: an all-day loading at Veroia on the day of a 16:00 arrival there (00:00 <
  -- 16:00) was refused. An all-day window is compared as a day (plan_h_before). Only refusals go: a loading that ends
  -- before the arrival starts also started before it (CHECK rt_stops_win, planned_to > planned_from).
  if prev.id is not null and plan_h_before(pk.planned_from, pk.planned_to, prev.planned_from, prev.planned_to) then
    return 'chain_time:' || p_leg;
  end if;
$h$;
  r_1a CONSTANT text := $h$  v_i int; v_dpos int; v_ppos int;  -- 086: a drop moved after its own pickup
$h$;
  r_1b CONSTANT text := $h$  v_i int; v_dpos int; v_ppos int;  -- 086: a drop moved after its own pickup
  v_sw jsonb; v_sw0 jsonb;  -- 093: the side_time state of the trip now, and its last trace
$h$;
  r_2a CONSTANT text := $h$  -- Decision 5: the base alone writes seq - KATHODOS before ANODOS, then by planned_from. A stop that does not
  -- fit that order in time is refused at the end by 071 (stop_order / leg_order), never silently re-dated.
$h$;
  r_2b CONSTANT text := $h$  -- Decision 5: the base alone writes seq - KATHODOS before ANODOS, then by planned_from. A stop that does not
  -- fit that order in time is never silently re-dated: on its own side it is refused at the end by 071 (stop_order /
  -- leg_order); an ANODOS that runs before the KATHODOS is allowed since 093, with its trace below.
$h$;
  r_3a CONSTANT text := $h$                           jsonb_build_object('seq', r.seq), jsonb_build_object('seq', r.rn));
    end if;
  end loop;
$h$;
  r_3b CONSTANT text := $h$                           jsonb_build_object('seq', r.seq), jsonb_build_object('seq', r.rn));
    end if;
  end loop;
  -- 093 (owner 2/11): an ANODOS that runs before a KATHODOS of the same trip is no longer refused (plan_rt_problem).
  -- Every write that adds or moves stops ends here, so here is its trace: ONE audit_log row on the trip each time
  -- that state changes - into that order, another pair or other windows (names left out: a renamed place is no
  -- change of plan), or out of it - never a row per save. The actor is the person of the save.
  v_sw := plan_h_side_warn(p_rt) -> 0;
  if v_sw is not null then
    v_sw := jsonb_build_object('kathodos', (v_sw->'kathodos') - 'location', 'anodos', (v_sw->'anodos') - 'location');
  end if;
  select a.after_data -> 'side_time' into v_sw0 from audit_log a
   where a.record_id = p_rt::text and a.table_name = 'ct_round_trips' and a.after_data ? 'side_time'
   order by a.id desc limit 1;
  if coalesce(v_sw, 'null'::jsonb) is distinct from coalesce(v_sw0, 'null'::jsonb) then
    perform plan_h_audit(p_actor, p_role, 'update', 'ct_round_trips', p_rt::text,
                         jsonb_build_object('side_time', coalesce(v_sw0, 'null'::jsonb)),
                         jsonb_build_object('side_time', coalesce(v_sw, 'null'::jsonb)));
  end if;
$h$;
  u_1a CONSTANT text := $h$    v_warn := v_warn || plan_h_seg_v1_warn(v_rt) || plan_h_seg_stop_warn(v_rt, v_seg0);
$h$;
  u_1b CONSTANT text := $h$    v_warn := v_warn || plan_h_seg_v1_warn(v_rt) || plan_h_seg_stop_warn(v_rt, v_seg0);
    -- 093 (owner 2/11): an ANODOS that runs before a KATHODOS of this trip is saved and said (amber on the screen),
    -- in the dry run's preview and in the answer of the save
    v_warn := v_warn || plan_h_side_warn(v_rt);
$h$;
  p_1a CONSTANT text := $h$  v_warn := coalesce(p_tgt->'warnings', '[]'::jsonb) || v_warn;
$h$;
  p_1b CONSTANT text := $h$  v_warn := coalesce(p_tgt->'warnings', '[]'::jsonb) || v_warn;
  -- 093 (owner 2/11): an ANODOS that runs before a KATHODOS of the trip this put filled is saved and said
  v_warn := v_warn || plan_h_side_warn(v_rt);
$h$;
  m_1a CONSTANT text := $h$    v_put->'warnings', v_put->'notice_ids');
$h$;
  m_1b CONSTANT text := $h$    -- 093 (owner 2/11): side_time of the trip this move filled, read after the sweep and the reseq above (a move
    -- within one trip: the stops it left are gone now) - never plan_h_put's view from before them
    (select coalesce(jsonb_agg(w.v), '[]'::jsonb) from jsonb_array_elements(coalesce(v_put->'warnings', '[]'::jsonb)) w(v)
      where w.v->>'code' is distinct from 'side_time')
    || case when v_put->>'rt_id' is null then '[]'::jsonb else plan_h_side_warn((v_put->>'rt_id')::bigint) end,
    v_put->'notice_ids');
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype;
  v_trips int; v_stops int; v_allday int; v_legs int; v_rt0 bigint[]; v_leg0 bigint[]; v_rt1 bigint[]; v_leg1 bigint[];
  v_warned int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '093: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_problem(bigint)', '1b256db4b2a6ff7d0d8ed0e948a1894c'),
      ('public.plan_leg_problem(bigint)', '24803f176f12355faa84c07e43cb0df0'),
      ('public.plan_h_reseq(bigint,text,text)', '6f0c0daebd0963472291dd3546df93a9'),
      ('public.plan_rt_update(jsonb,text,text)', 'f232250e4672f3133b4a3fe06cb1da5c'),
      ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', '7ed550b6cafa5bf2fb88d65ba2c112bf'),
      ('public.plan_move_pieces(jsonb,text,text)', 'ec3b8073dc7d8e3666d89082433553b4')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '093: % is not its live text of 2/11 (093 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  IF to_regprocedure('public.plan_h_before(timestamptz,timestamptz,timestamptz,timestamptz)') IS NOT NULL
     OR to_regprocedure('public.plan_h_side_warn(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION '093: plan_h_before or plan_h_side_warn already exists (093 already applied?) - stop';
  END IF;
  -- BEFORE: what the live rules refuse today among the live v5 rows (committed rows passed them: expected none)
  SELECT count(*) INTO v_trips FROM public.ct_round_trips WHERE model = 2 AND status <> 'cancelled';
  SELECT count(*), count(*) FILTER (WHERE (s.planned_from AT TIME ZONE 'Europe/Athens')::time = '00:00'
                                      AND (s.planned_to AT TIME ZONE 'Europe/Athens')::time >= '23:59'
                                      AND (s.planned_from AT TIME ZONE 'Europe/Athens')::date = (s.planned_to AT TIME ZONE 'Europe/Athens')::date)
    INTO v_stops, v_allday
    FROM public.rt_stops s JOIN public.ct_round_trips r ON r.id = s.rt_id
   WHERE r.model = 2 AND r.status <> 'cancelled' AND s.deleted_at IS NULL;
  SELECT count(*) INTO v_legs FROM public.piece_legs l JOIN public.ct_round_trips r ON r.id = l.rt_id
   WHERE r.model = 2 AND r.status <> 'cancelled' AND l.deleted_at IS NULL;
  -- the live trips only (cancelled ones are never written again; the counts above are the same population)
  v_rt0 := ARRAY(SELECT r.id FROM public.ct_round_trips r WHERE r.model = 2 AND r.status <> 'cancelled'
                   AND public.plan_rt_problem(r.id) IS NOT NULL ORDER BY r.id);
  v_leg0 := ARRAY(SELECT l.id FROM public.piece_legs l JOIN public.ct_round_trips r ON r.id = l.rt_id
                   WHERE r.model = 2 AND r.status <> 'cancelled' AND l.deleted_at IS NULL AND public.plan_leg_problem(l.id) IS NOT NULL ORDER BY l.id);

  -- ===== PART 1: TWO NEW INTERNAL FUNCTIONS =====
  -- Window a ends before window b starts. All day = 00:00 to 23:59 (or later) of ONE Athens day, the form's "whole day"
  -- since 28/10: such a window is compared as a day (a's last day before b's first day), never by its minutes - so an
  -- all-day stop never falls before a timed stop of its own day, and never after it.
  CREATE FUNCTION public.plan_h_before(a_from timestamptz, a_to timestamptz, b_from timestamptz, b_to timestamptz)
    RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $f$
  select case when ((a_from at time zone 'Europe/Athens')::time = '00:00' and (a_to at time zone 'Europe/Athens')::time >= '23:59'
                    and (a_from at time zone 'Europe/Athens')::date = (a_to at time zone 'Europe/Athens')::date)
                or ((b_from at time zone 'Europe/Athens')::time = '00:00' and (b_to at time zone 'Europe/Athens')::time >= '23:59'
                    and (b_from at time zone 'Europe/Athens')::date = (b_to at time zone 'Europe/Athens')::date)
              then (a_to at time zone 'Europe/Athens')::date < (b_from at time zone 'Europe/Athens')::date
              else a_to <= b_from end
$f$;
  -- [] or ONE side_time warning: an ANODOS stop of the trip that runs before one of its KATHODOS stops - it ends
  -- before that KATHODOS starts (seq puts the KATHODOS first, decision 5), or it is ahead of it in seq (071's
  -- side_order) - the first pair by seq, both places and windows, and how many such pairs the trip holds. day = the
  -- stop's Athens day, the day of its planned_to (a night window 22:00-06:00 lives on its morning, as the order form
  -- says it; an all-day 00:00 is the day before in UTC)
  CREATE FUNCTION public.plan_h_side_warn(p_rt bigint) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = public AS $f$
  select coalesce((
    select jsonb_build_array(jsonb_build_object('code', 'side_time', 'rt_id', p_rt, 'pairs', x.n,
             'kathodos', jsonb_build_object('stop_id', x.k_id, 'location', x.k_loc, 'planned_from', x.k_from, 'planned_to', x.k_to,
                                            'day', (x.k_to at time zone 'Europe/Athens')::date),
             'anodos', jsonb_build_object('stop_id', x.a_id, 'location', x.a_loc, 'planned_from', x.a_from, 'planned_to', x.a_to,
                                          'day', (x.a_to at time zone 'Europe/Athens')::date)))
      from (select k.id as k_id, lk.name as k_loc, k.planned_from as k_from, k.planned_to as k_to,
                   a.id as a_id, la.name as a_loc, a.planned_from as a_from, a.planned_to as a_to,
                   count(*) over () as n, k.seq as ks, a.seq as az
              from rt_stops k
              join rt_stops a on a.rt_id = k.rt_id and a.side = 'ANODOS' and a.deleted_at is null
              left join locations lk on lk.id = k.location_id
              left join locations la on la.id = a.location_id
             where k.rt_id = p_rt and k.side = 'KATHODOS' and k.deleted_at is null
               and (a.seq < k.seq or plan_h_before(a.planned_from, a.planned_to, k.planned_from, k.planned_to))) x
     order by x.ks, x.az limit 1), '[]'::jsonb)
$f$;
  -- internal, as 086's helpers: no role calls them directly (the plan_* functions that do run as their owner)
  REVOKE ALL ON FUNCTION public.plan_h_before(timestamptz,timestamptz,timestamptz,timestamptz), public.plan_h_side_warn(bigint)
    FROM PUBLIC, anon, authenticated, service_role;

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_problem(bigint)', ARRAY[o_1a], ARRAY[o_1b], '5b627b94204f1c17ba021364157b337b'),
      ('public.plan_leg_problem(bigint)', ARRAY[c_1a], ARRAY[c_1b], 'a1092d96c0a6b5d5c6d7f0c8f5513f28'),
      ('public.plan_h_reseq(bigint,text,text)', ARRAY[r_1a, r_2a, r_3a], ARRAY[r_1b, r_2b, r_3b], 'b02f0d47d0f35cf539131f5e8378bad3'),
      ('public.plan_rt_update(jsonb,text,text)', ARRAY[u_1a], ARRAY[u_1b], '70476c188bab027722ceab6c81c6702c'),
      ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', ARRAY[p_1a], ARRAY[p_1b], '3b86b9a173e94a7cd45bb4fb53d9b387'),
      ('public.plan_move_pieces(jsonb,text,text)', ARRAY[m_1a], ARRAY[m_1b], 'f5f74b0ccdb8c1b7efff0a4d7084aea4')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '093: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '093: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '093: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef
       OR (SELECT provolatile FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.provolatile THEN
      RAISE EXCEPTION '093 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.plan_h_before(timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure)
       IS DISTINCT FROM (SELECT proacl::text FROM pg_proc WHERE oid = 'public.plan_rt_problem(bigint)'::regprocedure)
     OR (SELECT proacl::text FROM pg_proc WHERE oid = 'public.plan_h_side_warn(bigint)'::regprocedure)
       IS DISTINCT FROM (SELECT proacl::text FROM pg_proc WHERE oid = 'public.plan_rt_problem(bigint)'::regprocedure) THEN
    RAISE EXCEPTION '093 proof: plan_h_before / plan_h_side_warn do not hold the rights of the internal plan_* helpers';
  END IF;
  -- plan_h_before on literal windows (Athens, +02 in November): all day vs a timed stop of the same day - neither
  -- before the other; all day vs the next day; timed by the minute (touching = before, overlapping = not)
  IF public.plan_h_before('2026-11-03 00:00+02', '2026-11-03 23:59+02', '2026-11-03 16:00+02', '2026-11-03 18:00+02')
     OR public.plan_h_before('2026-11-03 16:00+02', '2026-11-03 18:00+02', '2026-11-03 00:00+02', '2026-11-03 23:59+02')
     OR NOT public.plan_h_before('2026-11-03 00:00+02', '2026-11-03 23:59+02', '2026-11-04 00:00+02', '2026-11-04 23:59+02')
     OR NOT public.plan_h_before('2026-11-03 00:00+02', '2026-11-03 23:59+02', '2026-11-04 09:00+02', '2026-11-04 10:00+02')
     OR public.plan_h_before('2026-11-04 00:00+02', '2026-11-04 23:59+02', '2026-11-03 09:00+02', '2026-11-03 10:00+02')
     OR NOT public.plan_h_before('2026-11-03 10:00+02', '2026-11-03 12:00+02', '2026-11-03 12:00+02', '2026-11-03 14:00+02')
     OR public.plan_h_before('2026-11-03 10:00+02', '2026-11-03 12:01+02', '2026-11-03 12:00+02', '2026-11-03 14:00+02')
     -- a night window Tue 22:00 - Wed 06:00 beside an all-day Tue and an all-day Wed: neither before the other, both ways
     OR public.plan_h_before('2026-11-03 22:00+02', '2026-11-04 06:00+02', '2026-11-03 00:00+02', '2026-11-03 23:59+02')
     OR public.plan_h_before('2026-11-03 00:00+02', '2026-11-03 23:59+02', '2026-11-03 22:00+02', '2026-11-04 06:00+02')
     OR public.plan_h_before('2026-11-03 22:00+02', '2026-11-04 06:00+02', '2026-11-04 00:00+02', '2026-11-04 23:59+02')
     OR public.plan_h_before('2026-11-04 00:00+02', '2026-11-04 23:59+02', '2026-11-03 22:00+02', '2026-11-04 06:00+02')
     -- and the day before / after them is: all-day Mon before it, all-day Thu after it
     OR NOT public.plan_h_before('2026-11-02 00:00+02', '2026-11-02 23:59+02', '2026-11-03 22:00+02', '2026-11-04 06:00+02')
     OR NOT public.plan_h_before('2026-11-03 22:00+02', '2026-11-04 06:00+02', '2026-11-05 00:00+02', '2026-11-05 23:59+02') THEN
    RAISE EXCEPTION '093 proof: plan_h_before does not compare an all-day window as a day';
  END IF;
  -- AFTER: the new rules refuse no live row the live rules accepted (they only take refusals away)
  v_rt1 := ARRAY(SELECT r.id FROM public.ct_round_trips r WHERE r.model = 2 AND r.status <> 'cancelled'
                   AND public.plan_rt_problem(r.id) IS NOT NULL ORDER BY r.id);
  v_leg1 := ARRAY(SELECT l.id FROM public.piece_legs l JOIN public.ct_round_trips r ON r.id = l.rt_id
                   WHERE r.model = 2 AND r.status <> 'cancelled' AND l.deleted_at IS NULL AND public.plan_leg_problem(l.id) IS NOT NULL ORDER BY l.id);
  IF NOT (v_rt1 <@ v_rt0) OR NOT (v_leg1 <@ v_leg0) THEN
    RAISE EXCEPTION '093 proof: the new rules refuse trips % / legs % the live rules accepted', v_rt1, v_leg1;
  END IF;
  SELECT count(*) INTO v_warned FROM public.ct_round_trips r
   WHERE r.model = 2 AND r.status <> 'cancelled' AND public.plan_h_side_warn(r.id) <> '[]'::jsonb;
  RAISE NOTICE '093 OK: chain_time and stop_order refuse only an order no truck can drive (all day = a day), the ANODOS before the KATHODOS is a warning (side_time) with a trace | live v5: % trips, % stops (% all day), % legs | refused by the live rules: % trips, % legs; by 093: % trips, % legs | side_time now: % trips',
    v_trips, v_stops, v_allday, v_legs, cardinality(v_rt0), cardinality(v_leg0), cardinality(v_rt1), cardinality(v_leg1), v_warned;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_problem(bigint)'::regprocedure) AS rt_problem_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure) AS reseq_md5,
       (SELECT count(*) FROM public.ct_round_trips r WHERE r.model = 2 AND r.status <> 'cancelled'
          AND public.plan_h_side_warn(r.id) <> '[]'::jsonb) AS side_time_trips;
