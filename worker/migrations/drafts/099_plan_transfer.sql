-- 099 - NATIONAL v5: THE ACT "CHANGE ON THE ROAD" (transfer at any point, piece 2b): plan_transfer.
-- Design docs/national-v5/relax-leg-place-design-2026-11-02.md (owner 2/11, way B) and the approved screens
-- docs/national-v5/transfer-figma-2026-11-02.md (owner 2/11: ONE entry "Change on the road"; a free-text point named
-- by its text up to the first comma; a load waiting off Veroia carries into the next weeks' NEXT list). Build plan
-- docs/national-v5/transfer-build-plan-2026-11-02.md, piece 2b. Stacked on 098 (PR #230): 098 runs first.
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
--
-- WHAT WAS THERE (SELECT 2/11): 098's transfer stop and its rules (rt_stops.transfer_reason / _note / _waits /
-- _from_stop_id, leg_place / split at a transfer stop, transfer_chain, transfer_left) - and no act that writes one.
-- NOW, in ONE transaction, plan_transfer(p, actor, role) - the base's whole act for the window "Change on the road":
--   1. truck A (p.rt_id) gets a stop at the point (a catalogue place, or free text on ONE catalogue place "TRANSFER
--      POINT", decision 1) with the reason, the note, who and when (the stop's audit row);
--   2. every listed load that A carries past the point is unloaded there: its leg on A is cut at the point (soft-deleted
--      and written again to the point, its number kept; the pallet ledger follows, 073: nothing moves at the point);
--   3. with "pallets" below the load's, it splits there (decision 3) into the part and the rest;
--   4. each part (the whole load, the part, the rest) goes: to one of p.trucks (an existing trip of B, or a new one -
--      plan_h_target / plan_h_put, B's loading stop at the point with A's window, linked to A's stop), or "stay" (a
--      rest that stays on A: it loads again at A's own stop, which then names itself), or "wait" (it waits at the
--      point; A's stop says so - the red mark, decision 2);
--   5. A's stops that lost every leg go (decision 4); A's order (plan_h_reseq); the international's Veroia day
--      follows its Veroia stop only (097).
--   dry_run: everything, then undone; the preview names every truck's stops after, the international days that move,
--   what waits, and whole_vehicle - every load goes whole to ONE new vehicle: the screen saves that as the vehicle
--   change of 072b instead (owner 2/11, "one entry"), the base says when.
--   request_id: required for the save (decision 44); the same request again returns the first answer.
-- Also: rt_stops.transfer_place (the free text of a point, apart from the user's note) and the one place "TRANSFER
-- POINT" (legacy_id v5_transfer_point; the screens keep it out of their place lists, piece 5).
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L; the texts 098 wrote (and its four columns); the live texts plan_transfer calls (md5,
--           production 2/11); plan_transfer, transfer_place and the place absent
--   PART 1  rt_stops.transfer_place + its CHECK; the place TRANSFER POINT
--   PART 2  plan_transfer (SECURITY DEFINER, search_path public, as plan_seg_change), its rights: born closed, then
--           EXECUTE for service_role only (the Worker)
--   PART 3  proofs: the text measured, the rights, nothing else changed; NOTICE "099 OK: ..."
-- No trigger, no row written but the place. No Worker change HERE: POST /plan/transfer goes into ONE Worker chain with
-- /plan/drafts (coordinator 2/11), built from the live Worker 7bb5003a.
-- ORDER: 097 -> 098 -> 099. RUN: 099_plan_transfer_dryrun.sql, then this file, then 099_plan_transfer_verify.sql.
-- REVERSE: 099_plan_transfer_rollback.sql BEFORE 098's rollback (refused while a transfer exists).
DO $do$
DECLARE
  m_fn CONSTANT text := 'd254e712e7b3f5ef0914afb94228f80e';
  v_g record; v_trg0 int; v_trg1 int; v_loc bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '099: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      -- the texts 098 writes (order 098 -> 099)
      ('public.plan_leg_problem(bigint)', '2f70aa1b84ad7fc2cba76756e28c4289'),
      ('public.plan_shipment_problem(bigint)', '6afcc505725de48444c04deb770f72c4'),
      ('public.plan_split_piece(jsonb,text,text)', 'f1993aeb0344b24e8abad84d8f92603d'),
      -- called by plan_transfer, not patched (production 2/11)
      ('public.plan_h_ctx(text,text)', '3977cf1c3284b0d776384b045de95c36'),
      ('public.plan_h_keys(jsonb,text[],text)', 'd47dafd77a067aa6356efc6962a50e0e'),
      ('public.plan_h_accept_busy(jsonb,text,text,text)', '1e5d0fe69ff7468ca42d2867d0a21001'),
      ('public.plan_h_replay(jsonb,text,text)', '28b01f380ea20eea9e38959767310fc2'),
      ('public.plan_h_remember(jsonb,text,jsonb,text,text)', 'cd4164c46d887b29e4410c6875381c5a'),
      ('public.plan_h_finish()', '59d88ec85661d3ef2ac957aecd0e0fcd'),
      ('public.plan_h_ok(text,jsonb,jsonb,jsonb)', 'cc4b43dc712e5389398840bf7b687cf5'),
      ('public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_location(bigint)', '4e852a116a9656eada5bb9ccc1215699'),
      ('public.plan_h_stop_add(bigint,bigint,text,timestamp with time zone,timestamp with time zone,text,text)', '1ae558b67e384a06c6a1a6d1ee6a3af7'),
      ('public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)', 'c6f40152cd13f2ec502872e803c10b8e'),
      ('public.plan_h_leg_drop(bigint,text,text,text)', 'cb48e1aeba2d8e78191b9fc47eae6d67'),
      ('public.plan_h_target(jsonb,jsonb,text,text)', 'a56f5d9fe6a321aeef3db7b030ccdb6e'),
      ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', '3b86b9a173e94a7cd45bb4fb53d9b387'),
      ('public.plan_h_stops_sweep(bigint[],text,text,text)', 'e95fbdd0ad5f082f8895165c726b67ef'),
      ('public.plan_h_reseq(bigint,text,text)', 'b02f0d47d0f35cf539131f5e8378bad3'),
      ('public.plan_h_vs_follow(bigint[],text,text)', '06fdac4113e4b852e2734882bbad4d98'),
      ('public.plan_h_side_warn(bigint)', 'db3efce3042dde0a5d167e6c080f1f13'),
      ('public.plan_rt_create(jsonb,text,text)', '7e6abee9852b952a1de922d0dbc794bf')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '099: % is not the text 099 builds on (md5 %; 098 first, or changed since) - stop', v_g.sig,
        (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig));
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rt_stops'
        AND column_name IN ('transfer_reason', 'transfer_note', 'transfer_waits', 'transfer_from_stop_id')) <> 4 THEN
    RAISE EXCEPTION '099: rt_stops has not the four transfer columns of 098 - run 098 first';
  END IF;
  IF to_regprocedure('public.plan_transfer(jsonb,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION '099: plan_transfer exists - already applied, run 099_plan_transfer_verify.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rt_stops'
               AND column_name = 'transfer_place')
     OR EXISTS (SELECT 1 FROM public.locations WHERE legacy_id = 'v5_transfer_point') THEN
    RAISE EXCEPTION '099: rt_stops.transfer_place or the place v5_transfer_point exists - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- ===== PART 1: THE FREE TEXT OF A POINT, AND ITS ONE PLACE =====
  -- the text belongs to a transfer stop (the one with the reason) and is never blank; the user's own note stays in
  -- transfer_note (decision 1: a place OR a text; the screen names a text point by its text up to the first comma)
  ALTER TABLE public.rt_stops
    ADD COLUMN transfer_place text,
    ADD CONSTRAINT rt_stops_transfer_place CHECK (transfer_place IS NULL OR (transfer_reason IS NOT NULL AND transfer_place ~ '[^[:space:]]'));
  -- rt_stops.location_id is NOT NULL (071): every free-text point stands on this one place (no coordinates: no
  -- kilometres are computed for it, the auditor counts those trips, piece 6)
  INSERT INTO public.locations (legacy_id, name, type, country, tags, notes)
  VALUES ('v5_transfer_point', 'TRANSFER POINT (free text)', 'Custom Point', 'GR', ARRAY['v5_transfer_point'],
          'Migration 099: the place of every transfer point written as free text (rt_stops.transfer_place). Not a pick-list place.')
  RETURNING id INTO v_loc;

  -- ===== PART 2: THE ACT =====
  CREATE FUNCTION public.plan_transfer(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  v_dry boolean; v_ans jsonb; v_rt bigint; r ct_round_trips%rowtype; v_loc bigint; v_text text; v_note text;
  v_reason text; v_side text; v_from timestamptz; v_to timestamptz; v_hub bigint; v_stop bigint;
  ld jsonb; v_pid bigint; l piece_legs%rowtype; pk rt_stops%rowtype; dr rt_stops%rowtype; p0 shipment_pieces%rowtype;
  v_pal numeric; c1 shipment_pieces%rowtype; c2 shipment_pieces%rowtype; v_parts jsonb; x jsonb; v_go jsonb;
  v_piece bigint; v_n int; v_i int; t jsonb; v_tgt jsonb; v_tp bigint; v_put jsonb;
  v_legs bigint[] := '{}'; v_new bigint[] := '{}'; v_pcs bigint[] := '{}'; v_drops bigint[] := '{}'; v_rts bigint[] := '{}';
  v_seen bigint[] := '{}'; v_go_to jsonb := '{}'; v_wait boolean := false; v_self boolean := false;
  v_warn jsonb := '[]'; v_notices bigint[] := '{}'; v_orders bigint[]; v_cd0 jsonb; v_cd1 jsonb; v_whole boolean;
  v_old jsonb; v_res jsonb; v_hint text; v_msg text; v_det text; v_cname text; v_state text; v_code text;
begin
  -- "Change on the road" (owner 2/11): at a point - a catalogue place or a text - for a reason, truck A hands loads
  -- (whole, or a part) to another truck, keeps a rest, or leaves them waiting there. One act, one transaction: the
  -- deferred rules of 071 / 098 judge the result at the end (plan_h_finish), never a half-done transfer.
  perform plan_h_ctx(p_actor, p_role);
  perform plan_h_keys(p, array['rt_id', 'point', 'side', 'planned_from', 'planned_to', 'reason', 'note', 'loads',
                               'trucks', 'request_id', 'dry_run', 'accept_busy'], 'p');
  -- 086: accept_busy = true lets a truck of this act overlap another trip of its truck / driver, with a trace
  perform plan_h_accept_busy(p, 'p', p_actor, p_role);
  if p ? 'dry_run' and jsonb_typeof(p->'dry_run') <> 'boolean' then perform plan_h_raise('bad_input', 'dry_run'); end if;
  v_dry := coalesce((p->>'dry_run')::boolean, false);
  -- decision 44: a transfer CREATES stops, legs and pieces - the same request again returns the first answer
  if not v_dry then
    v_ans := plan_h_replay(p, 'plan_transfer', p_actor);
    if v_ans is not null then return v_ans; end if;
  end if;
  if jsonb_typeof(p->'point') is distinct from 'object' then perform plan_h_raise('bad_input', 'point'); end if;
  perform plan_h_keys(p->'point', array['location_id', 'text'], 'point');
  if (p->'point' ? 'location_id') = (p->'point' ? 'text') then perform plan_h_raise('bad_input', 'point: location_id or text'); end if;
  -- an object / array / number as a text would be kept as its JSON text (072's K1 input rule)
  if exists (select 1 from (values (p->'reason'), (p->'note'), (p->'side'), (p->'point'->'text')) v(j)
              where v.j is not null and jsonb_typeof(v.j) <> 'string') then
    perform plan_h_raise('bad_input', 'text');
  end if;
  if jsonb_typeof(p->'loads') is distinct from 'array' or jsonb_array_length(p->'loads') = 0 then
    perform plan_h_raise('bad_input', 'loads');
  end if;
  if p ? 'trucks' and jsonb_typeof(p->'trucks') <> 'array' then perform plan_h_raise('bad_input', 'trucks'); end if;
  v_n := coalesce(jsonb_array_length(p->'trucks'), 0);
  v_rt := (p->>'rt_id')::bigint;
  v_from := (p->>'planned_from')::timestamptz;
  v_to := (p->>'planned_to')::timestamptz;
  if v_rt is null or v_from is null or v_to is null then perform plan_h_raise('bad_input', 'rt_id, planned_from and planned_to'); end if;
  if not (isfinite(v_from) and isfinite(v_to)) then perform plan_h_raise('bad_input', 'planned:finite'); end if;
  if v_to <= v_from then perform plan_h_raise('bad_input', 'planned_to'); end if;
  v_side := p->>'side';
  if v_side is null or v_side not in ('KATHODOS', 'ANODOS') then perform plan_h_raise('bad_input', 'side'); end if;
  -- the reason is required here (a transfer without one says nothing); its VALUE is 098's CHECK (one list)
  v_reason := nullif(btrim(coalesce(p->>'reason', '')), '');
  if v_reason is null then perform plan_h_raise('bad_input', 'reason'); end if;
  v_note := nullif(btrim(coalesce(p->>'note', '')), '');
  if p->'point' ? 'text' then
    v_text := btrim(p->'point'->>'text');
    if v_text !~ '[^[:space:]]' then perform plan_h_raise('bad_input', 'point.text'); end if;
    select id into v_loc from locations where legacy_id = 'v5_transfer_point' and deleted_at is null;
    if v_loc is null then perform plan_h_raise('bad_input', 'point.text:no place'); end if;
  else
    v_loc := plan_h_location((p->'point'->>'location_id')::bigint);
  end if;
  select id into v_hub from locations where is_hub;
  -- at Veroia a load is split and assigned on the Veroia board (Composition), never "on the road"
  if v_loc = v_hub then perform plan_h_raise('transfer_at_hub', v_loc::text); end if;

  -- ONE lock order (as plan_split_piece): every trip - A and the existing trips of the trucks - by id, then the
  -- loads by id, before anything is read for writing
  perform 1 from ct_round_trips c
   where c.id = v_rt or c.id in (select (q->'target'->>'rt_id')::bigint from jsonb_array_elements(coalesce(p->'trucks', '[]')) q
                                  where jsonb_typeof(q) = 'object' and jsonb_typeof(q->'target') = 'object' and q->'target' ? 'rt_id')
   order by c.id for no key update;
  select * into r from ct_round_trips where id = v_rt;
  if r.id is null or r.model <> 2 then perform plan_h_raise('rt_gone', v_rt::text); end if;
  if r.status = 'cancelled' then perform plan_h_raise('rt_cancelled', r.code); end if;
  perform 1 from shipment_pieces sp
   where sp.id in (select (q->>'piece_id')::bigint from jsonb_array_elements(p->'loads') q where jsonb_typeof(q) = 'object')
   order by sp.id for no key update;
  -- the international days before (the preview's "from")
  select coalesce(array_agg(distinct s.order_id), '{}') into v_orders
    from shipment_pieces sp join shipments s on s.id = sp.shipment_id
   where sp.id in (select (q->>'piece_id')::bigint from jsonb_array_elements(p->'loads') q where jsonb_typeof(q) = 'object')
     and s.order_id is not null;
  select coalesce(jsonb_object_agg(o.id::text, o.cross_dock_date), '{}') into v_cd0 from orders o where o.id = any (v_orders);

  begin
    -- 1. A's stop at the point: the reason, the note, the text; who and when are its audit rows
    v_stop := plan_h_stop_add(v_rt, v_loc, v_side, v_from, v_to, p_actor, p_role);
    select to_jsonb(s) into v_old from rt_stops s where s.id = v_stop;
    update rt_stops set transfer_reason = v_reason, transfer_note = v_note, transfer_place = v_text where id = v_stop;
    perform plan_h_audit(p_actor, p_role, 'update', 'rt_stops', v_stop::text, v_old,
                         (select to_jsonb(s) from rt_stops s where s.id = v_stop));
    -- 2. each load A carries past the point: cut there, split if asked, each part's way remembered
    for ld in select value from jsonb_array_elements(p->'loads') loop
      perform plan_h_keys(ld, array['piece_id', 'pallets', 'go', 'rest'], 'load');
      v_pid := (ld->>'piece_id')::bigint;
      if v_pid is null or v_pid = any (v_seen) then perform plan_h_raise('bad_input', 'load.piece_id'); end if;
      v_seen := v_seen || v_pid;
      select * into p0 from shipment_pieces where id = v_pid;
      if p0.id is null or p0.deleted_at is not null then perform plan_h_raise('piece_dead', v_pid::text); end if;
      if exists (select 1 from shipment_pieces c where c.parent_piece_id = p0.id and c.deleted_at is null) then
        perform plan_h_raise('piece_split', p0.id::text);
      end if;
      select q.* into l from piece_legs q where q.piece_id = v_pid and q.rt_id = v_rt and q.deleted_at is null
       order by q.leg_no desc limit 1;
      if l.id is null then perform plan_h_raise('transfer_not_on_board', v_pid::text); end if;
      select * into pk from rt_stops where id = l.pickup_stop_id;
      select * into dr from rt_stops where id = l.drop_stop_id;
      -- on board at the point: loaded before it starts, unloaded after it ends
      if pk.planned_from > v_from or dr.planned_to < v_to then perform plan_h_raise('transfer_not_on_board', v_pid::text); end if;
      perform plan_h_leg_drop(l.id, 'transfer', p_actor, p_role);
      v_legs := v_legs || plan_h_leg_add(v_pid, v_rt, l.pickup_stop_id, v_stop, p_actor, p_role, null);
      v_drops := v_drops || l.drop_stop_id;
      v_pal := (ld->>'pallets')::numeric;
      if v_pal is not null and not (abs(v_pal) < 'Infinity'::numeric) then perform plan_h_raise('bad_input', 'pallets:finite'); end if;
      if v_pal is not null and v_pal <> round(v_pal, 1) then perform plan_h_raise('bad_input', 'pallets:one decimal'); end if;
      if v_pal is not null and v_pal is distinct from p0.pallets then
        -- decision 3: a split within a transfer, at its stop - the part and the rest each take their own way
        if p0.pallets is null then perform plan_h_raise('parts_sum', p0.id || ':pallets unknown'); end if;
        if v_pal <= 0 or v_pal >= p0.pallets then perform plan_h_raise('parts_sum', format('%s:%s>=%s', p0.id, v_pal, p0.pallets)); end if;
        if not (ld ? 'rest') then perform plan_h_raise('bad_input', 'load.rest'); end if;
        update shipment_pieces set split_at = now(), split_by = p_actor where id = p0.id;
        perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', p0.id::text,
                             jsonb_build_object('split_at', null), jsonb_build_object('split_at', now(), 'split_by', p_actor));
        insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
        values (p0.shipment_id, p0.id, v_pal, p_actor) returning * into c1;
        insert into shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by)
        values (p0.shipment_id, p0.id, p0.pallets - v_pal, p0.leave_by, p_actor) returning * into c2;
        perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', c1.id::text, null, to_jsonb(c1));
        perform plan_h_audit(p_actor, p_role, 'create', 'shipment_pieces', c2.id::text, null, to_jsonb(c2));
        v_new := v_new || c1.id || c2.id;
        v_parts := jsonb_build_array(jsonb_build_object('piece', c1.id, 'go', ld->'go', 'drop', l.drop_stop_id, 'part', true),
                                     jsonb_build_object('piece', c2.id, 'go', ld->'rest', 'drop', l.drop_stop_id, 'part', true));
      else
        if ld ? 'rest' then perform plan_h_raise('bad_input', 'load.rest'); end if;
        v_parts := jsonb_build_array(jsonb_build_object('piece', v_pid, 'go', ld->'go', 'drop', l.drop_stop_id, 'part', false));
      end if;
      for x in select value from jsonb_array_elements(v_parts) loop
        v_piece := (x->>'piece')::bigint;
        v_go := x->'go';
        v_pcs := v_pcs || v_piece;
        if v_go = '"wait"'::jsonb then
          v_wait := true;
        elsif v_go = '"stay"'::jsonb then
          -- a load that stays whole on A is not a transfer (nothing would change but its stop)
          if not (x->>'part')::boolean then perform plan_h_raise('bad_input', 'load.go:stay'); end if;
          v_legs := v_legs || plan_h_leg_add(v_piece, v_rt, v_stop, (x->>'drop')::bigint, p_actor, p_role, null);
          v_self := true;
        elsif jsonb_typeof(v_go) = 'number' and (v_go::text) ~ '^[0-9]+$' and (v_go::text)::int < v_n then
          v_go_to := jsonb_set(v_go_to, array[v_go::text],
                               coalesce(v_go_to->(v_go::text), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('piece_id', v_piece, 'pickup', 'transfer')));
        else
          perform plan_h_raise('bad_input', 'load.go');
        end if;
      end loop;
    end loop;
    -- 3. A's stop says what it is: "waits there" (decision 2), and names itself when a rest loads again on A
    if v_wait or v_self then
      select to_jsonb(s) into v_old from rt_stops s where s.id = v_stop;
      update rt_stops set transfer_waits = v_wait, transfer_from_stop_id = case when v_self then v_stop end where id = v_stop;
      perform plan_h_audit(p_actor, p_role, 'update', 'rt_stops', v_stop::text, v_old,
                           (select to_jsonb(s) from rt_stops s where s.id = v_stop));
    end if;
    -- 4. each truck that takes loads, once: its loading stop at the point (A's window, the truck's side), linked to
    -- A's stop; its unloading where each load ends (its stops), as every assignment (plan_h_target / plan_h_put)
    for v_i in 0 .. v_n - 1 loop
      t := p->'trucks'->v_i;
      perform plan_h_keys(t, array['target', 'stops'], 'truck');
      if not (v_go_to ? v_i::text) then perform plan_h_raise('bad_input', 'trucks[' || v_i || ']:no load'); end if;
      if jsonb_typeof(t->'target') is distinct from 'object' or (t ? 'stops' and jsonb_typeof(t->'stops') <> 'array') then
        perform plan_h_raise('bad_input', 'truck');
      end if;
      v_tgt := plan_h_target(t->'target',
                 coalesce(t->'stops', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ref', 'transfer', 'location_id', v_loc,
                   'side', coalesce(t->'target'->>'side', v_side), 'planned_from', v_from, 'planned_to', v_to)),
                 p_actor, p_role);
      v_tp := (v_tgt->'stops'->>'transfer')::bigint;
      select to_jsonb(s) into v_old from rt_stops s where s.id = v_tp;
      update rt_stops set transfer_from_stop_id = v_stop where id = v_tp;
      perform plan_h_audit(p_actor, p_role, 'update', 'rt_stops', v_tp::text, v_old,
                           (select to_jsonb(s) from rt_stops s where s.id = v_tp));
      v_put := plan_h_put(v_go_to->(v_i::text), v_tgt, p_actor, p_role, '{}');
      v_legs := v_legs || array(select jsonb_array_elements_text(v_put->'leg_ids')::bigint);
      v_warn := v_warn || coalesce(v_put->'warnings', '[]'::jsonb);
      v_notices := v_notices || array(select jsonb_array_elements_text(coalesce(v_put->'notice_ids', '[]'))::bigint);
      v_rts := v_rts || (v_tgt->>'rt_id')::bigint;
    end loop;
    -- 5. A's stops that lost every leg go (decision 4); A's order; the international follows its Veroia stop (097)
    perform plan_h_stops_sweep(v_drops, 'transfer', p_actor, p_role);
    perform plan_h_reseq(v_rt, p_actor, p_role);
    v_notices := v_notices || plan_h_vs_follow(v_pcs, p_actor, p_role);
    v_warn := v_warn || plan_h_side_warn(v_rt);
    -- whole_vehicle: every load A carries past the point goes whole to ONE new vehicle - the screen saves this as the
    -- vehicle change of 072b (owner 2/11, one entry); the base says when, the screen decides nothing alone
    v_whole := v_n = 1 and cardinality(v_new) = 0 and not v_wait and not v_self
      and (p->'trucks'->0->'target') ? 'new_rt'
      and not exists (select 1 from piece_legs q join rt_stops a on a.id = q.pickup_stop_id join rt_stops b on b.id = q.drop_stop_id
                       where q.rt_id = v_rt and q.deleted_at is null and q.drop_stop_id <> v_stop
                         and a.planned_from <= v_from and b.planned_to >= v_to);
    select coalesce(jsonb_object_agg(o.id::text, o.cross_dock_date), '{}') into v_cd1 from orders o where o.id = any (v_orders);
    if not v_dry then
      v_ans := plan_h_ok('plan_transfer',
                 jsonb_build_object('rt_id', v_rt, 'stop_id', v_stop, 'rt_ids', to_jsonb(v_rts), 'leg_ids', to_jsonb(v_legs),
                                    'piece_ids', to_jsonb(v_pcs), 'new_piece_ids', to_jsonb(v_new)),
                 v_warn, to_jsonb(v_notices));
      perform plan_h_remember(p, 'plan_transfer', v_ans, p_actor, p_role);
    end if;
    perform plan_h_finish();
    if v_dry then
      v_res := jsonb_build_object(
        -- every truck of the act after it: its live stops (new = written now, removed = soft-deleted now)
        'trucks', (select coalesce(jsonb_agg(jsonb_build_object('rt_id', c.id, 'code', c.code, 'stops',
                     (select coalesce(jsonb_agg(jsonb_build_object('stop_id', s.id, 'seq', s.seq, 'location_id', s.location_id,
                               'place', lo.name, 'text', s.transfer_place, 'side', s.side, 'planned_from', s.planned_from,
                               'planned_to', s.planned_to, 'transfer_reason', s.transfer_reason,
                               'transfer_from_stop_id', s.transfer_from_stop_id, 'transfer_waits', s.transfer_waits,
                               'new', s.created_at = now() and s.deleted_at is null, 'removed', s.deleted_at = now())
                               order by s.deleted_at is not null, s.seq, s.id), '[]'::jsonb)
                        from rt_stops s join locations lo on lo.id = s.location_id
                       where s.rt_id = c.id and (s.deleted_at is null or s.deleted_at = now())))
                     order by c.id <> v_rt, c.id), '[]'::jsonb)
                     from ct_round_trips c where c.id = v_rt or c.id = any (v_rts)),
        'vs_day', (select coalesce(jsonb_agg(jsonb_build_object('order_id', k::bigint, 'from', v_cd0->>k, 'to', v_cd1->>k)
                     order by k::bigint), '[]'::jsonb)
                     from jsonb_object_keys(v_cd1) k where v_cd1->>k is distinct from v_cd0->>k),
        -- what waits at the point (decision 2: the red "waits at <place> since <day>")
        'waiting', (select coalesce(jsonb_agg(jsonb_build_object('piece_id', pp.piece_id, 'pallets', pp.pallets)
                      order by pp.piece_id), '[]'::jsonb)
                      from v_piece_pos pp where pp.last_drop_stop_id = v_stop and not pp.is_split and pp.piece_id = any (v_pcs)),
        'whole_vehicle', v_whole, 'warnings', v_warn, 'conflict', null);
      raise exception 'plan dry run' using errcode = 'P0001', hint = 'plan_dry_run', detail = v_res::text;
    end if;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text, v_det = pg_exception_detail,
                            v_cname = constraint_name, v_state = returned_sqlstate;
    if v_hint = 'plan_dry_run' then
      return jsonb_build_object('ok', true, 'op', 'plan_transfer', 'dry_run', true, 'preview', v_det::jsonb);
    end if;
    if v_dry and (v_hint like 'plan:%' or coalesce(v_cname, '') <> '') then
      -- the preview SHOWS the rule the transfer would break (plan_seg_change's pattern); nothing was kept
      v_code := case when v_hint like 'plan:%' then substr(v_hint, 6) else v_cname end;
      return jsonb_build_object('ok', true, 'op', 'plan_transfer', 'dry_run', true,
        'preview', jsonb_build_object('trucks', null, 'vs_day', '[]'::jsonb, 'waiting', '[]'::jsonb, 'whole_vehicle', false,
                                      'warnings', '[]'::jsonb,
                                      'conflict', jsonb_build_object('code', v_code, 'sqlstate', v_state,
                                        'detail', case when strpos(v_msg, v_code || ':') > 0
                                                       then substr(v_msg, strpos(v_msg, v_code || ':') + length(v_code) + 1) end)));
    end if;
    raise;
  end;
  return v_ans;
exception
  -- a malformed number / time in the body is bad_input, never a raw 22P02 / 22007 (the Worker's 500)
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or invalid_parameter_value then
    perform plan_h_raise('bad_input', sqlstate);
end
$f$;
  -- born closed (principle 5): the default ACL of postgres gives EXECUTE to PUBLIC, anon and authenticated
  REVOKE ALL ON FUNCTION public.plan_transfer(jsonb,text,text) FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.plan_transfer(jsonb,text,text) TO service_role;

  -- ===== PART 3: PROOFS =====
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_transfer(jsonb,text,text)'::regprocedure) <> m_fn THEN
    RAISE EXCEPTION '099 proof: plan_transfer is not the measured text (md5 %)',
      (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_transfer(jsonb,text,text)'::regprocedure);
  END IF;
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.plan_transfer(jsonb,text,text)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres}'
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.plan_transfer(jsonb,text,text)'::regprocedure) THEN
    RAISE EXCEPTION '099 proof: plan_transfer has other rights than service_role only, or is not SECURITY DEFINER';
  END IF;
  IF (SELECT count(*) FROM public.locations WHERE legacy_id = 'v5_transfer_point' AND deleted_at IS NULL AND NOT is_hub) <> 1
     OR EXISTS (SELECT 1 FROM public.rt_stops WHERE transfer_place IS NOT NULL) THEN
    RAISE EXCEPTION '099 proof: the place TRANSFER POINT is not one live place, or a stop holds a text';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '099 proof: trigger count % -> %', v_trg0, v_trg1; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '099 OK: plan_transfer (service_role only), rt_stops.transfer_place, the place TRANSFER POINT (id %); triggers %',
    v_loc, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.plan_transfer(jsonb,text,text)')) AS transfer_md5,
       (SELECT id FROM public.locations WHERE legacy_id = 'v5_transfer_point') AS transfer_point_id;
