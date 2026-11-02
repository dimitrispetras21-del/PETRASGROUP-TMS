-- 098 - NATIONAL v5: THE TRANSFER STOP AND ITS RULES (transfer at any point, piece 2a).
-- Design docs/national-v5/relax-leg-place-design-2026-11-02.md (owner 2/11, way B: "Transfer" as one act; a point by
-- catalogue place or free text; a load may wait there with a red mark; a split only within a transfer; revenue equal;
-- no pallet movement there). Build plan docs/national-v5/transfer-build-plan-2026-11-02.md, piece 2a.
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
--
-- WHAT WAS THERE (SELECT 2/11, every md5 below re-measured on production that day): leg_place (071) lets a load ride
-- only from its national start, through Veroia, to its national end; split_not_at_hub / not_at_hub let it split only at
-- Veroia; chain: a leg loads where the previous one unloaded - compared by PLACE.
-- NOW (opens nothing by itself: no operation writes a transfer stop before 099):
--   * rt_stops + transfer_reason (the 8 reasons of 072b + meeting + partner_handover), transfer_note, transfer_waits,
--     transfer_from_stop_id. Truck A's stop where it unloads at the point carries the reason (and the note, and "waits
--     there"); truck B's stop where it loads names A's stop. A part that stays on A loads at that same stop, which then
--     names itself.
--   * leg_place: a leg may unload at a stop WITH a transfer reason, and load at a stop that NAMES a transfer stop -
--     anywhere. Never the same place at both ends (an empty "trip" would take a revenue share, 073 M-1 c).
--   * chain: a load that was unloaded at a transfer stop is loaded only at a stop that names THAT stop, and a stop that
--     names a transfer stop loads only what that stop unloaded. Exact stops, not places: two free-text points share one
--     catalogue place (decision 1, 099), so a place match would join two unrelated points. chain_time stays as it is.
--   * a load splits at Veroia OR at a transfer stop (decision 3); a load (or a part) left at a transfer stop without a
--     next truck is refused unless the stop says "waits there" (decisions 2 and 3): transfer_left.
--   * the Veroia day of a VS, ONE rule (097's): plan_rt_update's two copies (which VS follow a cycle's change) and
--     plan_h_vs_carriers (the vehicle the "follows" shows) read a Veroia stop only AT Veroia; plan_h_vs_carriers lists a
--     cycle once (a dated entry wins over the same cycle with no Veroia day: code review xhigh of 097).
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; v_vs_state = 097's view; the LIVE texts of the five functions patched and of plan_chk
--           (relied on: it re-judges the shipments of a stop that changes) = production 2/11; the four columns absent;
--           every live shipment as its rules judge it now (counted)
--   PART 1  the columns, their CHECKs, the index of the link
--   PART 2  live text + hunks: plan_leg_problem, plan_shipment_problem, plan_split_piece, plan_rt_update,
--           plan_h_vs_carriers (sql), each md5-proven, rights kept
--   PART 3  proofs: every live shipment judged as before; the rows of v_vs_state and the answer of plan_vs_state
--           unchanged; no stop holds a transfer value; triggers unchanged; NOTICE "098 OK: ..."
-- No trigger, no grant, no row written (the new columns are NULL / false everywhere). No Worker change: the new codes
-- (transfer_chain, transfer_left) cannot occur before 099; until the Worker learns their words they show as a code.
-- No screen change.
-- ORDER: after 097 (executed 2/11). Before 099. RUN: 098_plan_transfer_point_dryrun.sql, then this file, then
-- 098_plan_transfer_point_verify.sql. REVERSE: 098_plan_transfer_point_rollback.sql (the five texts back, the four
-- columns dropped; refused while any stop holds a transfer value).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  l_1a CONSTANT text := $h$  -- a piece rides only between its national start, the hub and its national end (it splits only at the hub)
  select id into hub_id from locations where is_hub;
  if pk.location_id = dr.location_id
     or (pk.location_id is distinct from vs.nat_from_location_id and pk.location_id is distinct from hub_id)
     or (dr.location_id is distinct from vs.nat_to_location_id and dr.location_id is distinct from hub_id) then
$h$;
  l_1b CONSTANT text := $h$  -- a piece rides only between its national start, the hub and its national end (it splits only at the hub).
  -- 098 (transfer at any point, owner 2/11): or from / to a TRANSFER stop - the stop where truck A unloads it carries a
  -- reason, the stop where truck B loads it names A's stop. Never the same place at both ends.
  select id into hub_id from locations where is_hub;
  if pk.location_id = dr.location_id
     or (pk.location_id is distinct from vs.nat_from_location_id and pk.location_id is distinct from hub_id
         and pk.transfer_from_stop_id is null)
     or (dr.location_id is distinct from vs.nat_to_location_id and dr.location_id is distinct from hub_id
         and dr.transfer_reason is null) then
$h$;
  l_2a CONSTANT text := $h$  if pk.location_id is distinct from start_loc then return 'chain:' || p_leg; end if;
$h$;
  l_2b CONSTANT text := $h$  if pk.location_id is distinct from start_loc then return 'chain:' || p_leg; end if;
  -- 098: a transfer joins two exact STOPS, not two places (free-text points share one catalogue place). Unloaded at a
  -- transfer stop, a load is loaded only at a stop that names that stop; loaded off its own route (not its national
  -- start, not Veroia) at a stop that names a transfer stop, only when it was unloaded at that very stop. A load that
  -- merely starts at a linked stop (its own origin, another load of the same truck) is a plain loading there (code
  -- review xhigh 2/11: a stop serves every load, the link speaks only for the transferred one).
  if (prev.transfer_reason is not null and pk.transfer_from_stop_id is distinct from prev.id)
     or (pk.location_id is distinct from vs.nat_from_location_id and pk.location_id is distinct from hub_id
         and pk.transfer_from_stop_id is not null and prev.transfer_reason is null) then
    return 'transfer_chain:' || p_leg;
  end if;
$h$;
  s_1a CONSTANT text := $h$  -- spec 3, Board: a load splits only at Veroia
  select id into hub_id from locations where is_hub;
  select pp.piece_id into bad from v_piece_pos pp
   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id limit 1;
  if bad is not null then return 'split_not_at_hub:' || bad; end if;
$h$;
  s_1b CONSTANT text := $h$  -- spec 3, Board: a load splits only at Veroia; 098 (decision 3, owner 2/11): or within a transfer, at its stop
  select id into hub_id from locations where is_hub;
  select pp.piece_id into bad from v_piece_pos pp
   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id
     and not exists (select 1 from rt_stops ts where ts.id = pp.last_drop_stop_id and ts.transfer_reason is not null
                       and ts.deleted_at is null)
   limit 1;
  if bad is not null then return 'split_not_at_hub:' || bad; end if;
  -- 098 (decisions 2 and 3): a load, or a part of it, left at a transfer stop with no next truck waits there only when
  -- the stop says so (the red "waits at <place> since <day>"); otherwise every part takes a truck in the same act. A
  -- load whose national END is that place is delivered, not left (code review xhigh 2/11). Its last drop being that
  -- stop already says no later leg took it.
  select pp.piece_id into bad from v_piece_pos pp join rt_stops ts on ts.id = pp.last_drop_stop_id
    join v_shipments vsh on vsh.shipment_id = pp.shipment_id
   where pp.shipment_id = p_sh and not pp.is_split and ts.transfer_reason is not null and not ts.transfer_waits
     and ts.deleted_at is null and pp.position_location_id is distinct from vsh.nat_to_location_id
   limit 1;
  if bad is not null then return 'transfer_left:' || bad; end if;
$h$;
  p_1a CONSTANT text := $h$  -- refused here with its own code, before 071's split_not_at_hub would refuse it at the end
  if ps.position_location_id is distinct from v_hub then perform plan_h_raise('not_at_hub', p0.id::text); end if;
$h$;
  p_1b CONSTANT text := $h$  -- refused here with its own code, before 071's split_not_at_hub would refuse it at the end; 098 (decision 3,
  -- owner 2/11): at Veroia, or at the transfer stop where the load was just unloaded
  if ps.position_location_id is distinct from v_hub
     and not exists (select 1 from rt_stops ts where ts.id = ps.last_drop_stop_id and ts.transfer_reason is not null
                       and ts.deleted_at is null) then
    perform plan_h_raise('not_at_hub', p0.id::text);
  end if;
$h$;
  u_1a CONSTANT text := $h$   where (case when ps.kind = 'vs_import' then (pk.planned_from at time zone 'Europe/Athens')::date
               else (dr.planned_to at time zone 'Europe/Athens')::date end) = vs.first_hub_day;
$h$;
  u_1b CONSTANT text := $h$   where (case when ps.kind = 'vs_import' then (pk.planned_from at time zone 'Europe/Athens')::date
               else (dr.planned_to at time zone 'Europe/Athens')::date end) = vs.first_hub_day
     -- 098: the Veroia stop AT Veroia only (097's rule; a transfer point is never a Veroia day)
     and (case when ps.kind = 'vs_import' then pk.location_id else dr.location_id end) = (select h.id from locations h where h.is_hub);
$h$;
  u_2a CONSTANT text := $h$     where (case when ps.kind = 'vs_import' then (pk.planned_from at time zone 'Europe/Athens')::date
                 else (dr.planned_to at time zone 'Europe/Athens')::date end) = vs.first_hub_day;
$h$;
  u_2b CONSTANT text := $h$     where (case when ps.kind = 'vs_import' then (pk.planned_from at time zone 'Europe/Athens')::date
                 else (dr.planned_to at time zone 'Europe/Athens')::date end) = vs.first_hub_day
       -- 098: the Veroia stop AT Veroia only (097's rule)
       and (case when ps.kind = 'vs_import' then pk.location_id else dr.location_id end) = (select h.id from locations h where h.is_hub);
$h$;
  c_1a CONSTANT text := $h$       where ps.order_id = p_order and ps.kind in ('vs_import', 'vs_export')
$h$;
  c_1b CONSTANT text := $h$       where ps.order_id = p_order and ps.kind in ('vs_import', 'vs_export')
         -- 098: the Veroia stop AT Veroia only (097's rule)
         and (case when ps.kind = 'vs_import' then pk.location_id else dr.location_id end) = (select hh.id from locations hh where hh.is_hub)
$h$;
  c_2a CONSTANT text := $h$       limit 1) h on true
$h$;
  c_2b CONSTANT text := $h$       limit 1) h on true
   -- 098: a cycle is listed once - its entry with no Veroia day goes when the same cycle also has a Veroia day
   where not (c.v->>'hub_day' is null
              and exists (select 1 from jsonb_array_elements(p_carriers) c2
                           where c2->>'rt_id' = c.v->>'rt_id' and c2->>'hub_day' is not null))
$h$;
  v_g record; v_h record; v_new text; p pg_proc%rowtype; v_lang text;
  v_trg0 int; v_trg1 int; v_bad0 int; v_bad1 int; v_sh int; v_vs0 text; v_vs1 text; v_ans0 text; v_ans1 text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '098: day L is not set (074 / 079) - stop';
  END IF;
  IF md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) <> '041915cfb57a58b09f29e5232232d515' THEN
    RAISE EXCEPTION '098: v_vs_state is not 097''s view (md5 %) - run 097 first', md5(pg_get_viewdef('public.v_vs_state'::regclass, true));
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      -- patched below (production 2/11, after 093 / 095 / 096 / 097)
      ('public.plan_leg_problem(bigint)', 'a1092d96c0a6b5d5c6d7f0c8f5513f28'),
      ('public.plan_shipment_problem(bigint)', 'eb19f0bd29b5cbc7843d2145be858727'),
      ('public.plan_split_piece(jsonb,text,text)', '37a87eb24ca148191962b5b54ba90f6d'),
      ('public.plan_rt_update(jsonb,text,text)', 'c2cedb4ed68bcab2dd85ffbe5bc13d9c'),
      ('public.plan_h_vs_carriers(bigint,jsonb)', '3c5b6af8b318188f03888396fbc40d21'),
      -- relied on, not patched: a stop that changes re-judges the shipments of its legs (071)
      ('public.plan_chk()', '8f2fa7e5541aded2dffc853a57c54c22')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '098: % is not the text 098 builds on (md5 %; already applied, or changed since) - stop', v_g.sig,
        (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig));
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rt_stops'
               AND column_name IN ('transfer_reason', 'transfer_note', 'transfer_waits', 'transfer_from_stop_id')) THEN
    RAISE EXCEPTION '098: rt_stops already has a transfer column - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- every live shipment as its rules judge it now (each passed at its own COMMIT: 0 expected)
  SELECT count(*), count(*) FILTER (WHERE public.plan_shipment_problem(s.id) IS NOT NULL) INTO v_sh, v_bad0
    FROM public.shipments s WHERE s.deleted_at IS NULL;
  SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.order_id), '')) INTO v_vs0 FROM public.v_vs_state v;
  SELECT md5(public.plan_vs_state(array(SELECT order_id FROM public.v_vs_state ORDER BY order_id))::text) INTO v_ans0;

  -- ===== PART 1: THE TRANSFER STOP =====
  ALTER TABLE public.rt_stops
    ADD COLUMN transfer_reason text,
    ADD COLUMN transfer_note text,
    ADD COLUMN transfer_waits boolean NOT NULL DEFAULT false,
    ADD COLUMN transfer_from_stop_id bigint REFERENCES public.rt_stops(id) ON DELETE RESTRICT,
    -- the reasons of a vehicle change (072b) and two of a transfer
    ADD CONSTRAINT rt_stops_transfer_reason CHECK (transfer_reason IS NULL OR transfer_reason = ANY (ARRAY['vehicle_breakdown',
      'reefer_breakdown', 'accident', 'driver_hours', 'driver_unavailable', 'planned_driver', 'planned_truck', 'other',
      'meeting', 'partner_handover'])),
    -- a note and "waits there" belong to a transfer stop (the one with the reason); a note is never blank
    ADD CONSTRAINT rt_stops_transfer_note CHECK (transfer_note IS NULL OR (transfer_reason IS NOT NULL AND transfer_note ~ '[^[:space:]]')),
    ADD CONSTRAINT rt_stops_transfer_waits CHECK (NOT transfer_waits OR transfer_reason IS NOT NULL);
  CREATE INDEX rt_stops_transfer_from ON public.rt_stops (transfer_from_stop_id) WHERE transfer_from_stop_id IS NOT NULL;

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_leg_problem(bigint)', ARRAY[l_1a, l_2a], ARRAY[l_1b, l_2b], '2f70aa1b84ad7fc2cba76756e28c4289'),
      ('public.plan_shipment_problem(bigint)', ARRAY[s_1a], ARRAY[s_1b], '6afcc505725de48444c04deb770f72c4'),
      ('public.plan_split_piece(jsonb,text,text)', ARRAY[p_1a], ARRAY[p_1b], 'f1993aeb0344b24e8abad84d8f92603d'),
      ('public.plan_rt_update(jsonb,text,text)', ARRAY[u_1a, u_2a], ARRAY[u_1b, u_2b], '2ed8efd0606344e2e3bca7efb933d4a6'),
      ('public.plan_h_vs_carriers(bigint,jsonb)', ARRAY[c_1a, c_2a], ARRAY[c_1b, c_2b], '59be1a67e0e2dbb3886c0686dca62a6d')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    SELECT lanname INTO v_lang FROM pg_language WHERE oid = p.prolang;
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR v_lang NOT IN ('plpgsql', 'sql') THEN
      RAISE EXCEPTION '098: % is not a plpgsql / sql function with search_path=public - stop', v_g.sig;
    END IF;
    v_new := p.prosrc;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '098: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '098: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
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
      RAISE EXCEPTION '098 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  -- the same shipments pass their rules (no stop holds a transfer value yet: the new branches are never taken)
  SELECT count(*) FILTER (WHERE public.plan_shipment_problem(s.id) IS NOT NULL) INTO v_bad1
    FROM public.shipments s WHERE s.deleted_at IS NULL;
  IF v_bad1 <> v_bad0 THEN
    RAISE EXCEPTION '098 proof: shipments with a rule problem % -> % - nothing kept, send this line to the coordinator', v_bad0, v_bad1;
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.order_id), '')) INTO v_vs1 FROM public.v_vs_state v;
  SELECT md5(public.plan_vs_state(array(SELECT order_id FROM public.v_vs_state ORDER BY order_id))::text) INTO v_ans1;
  IF v_vs1 <> v_vs0 OR v_ans1 <> v_ans0 THEN
    RAISE EXCEPTION '098 proof: v_vs_state or plan_vs_state answers otherwise - nothing kept, send this line to the coordinator';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rt_stops WHERE transfer_reason IS NOT NULL OR transfer_note IS NOT NULL OR transfer_waits
               OR transfer_from_stop_id IS NOT NULL) THEN
    RAISE EXCEPTION '098 proof: a stop holds a transfer value';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '098 proof: trigger count % -> %', v_trg0, v_trg1; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '098 OK: the transfer stop and its rules; shipments %, with a rule problem % (as before); VS answers unchanged; triggers %',
    v_sh, v_bad1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_leg_problem(bigint)'::regprocedure) AS leg_md5,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rt_stops'
         AND column_name LIKE 'transfer%') AS transfer_columns;
