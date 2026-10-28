-- 074a - NATIONAL v5, F5: THE READS DAY L NEEDS, BEFORE DAY L. 0 ROWS WRITTEN, REVERSIBLE.
--
-- DRAFT. Plan docs/superpowers/plans/2026-10-28-f5-national-v5-cutover.md, Task A (and the 28/10 note of Task B1:
-- plan_config is born HERE, empty). ORDER 073b (live 28/10) -> 074a -> Worker deploy 1 -> FE-1; day L: 074 + 074b.
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes:
--   1. 074a_plan_reads_dryrun.sql     this block + a deliberate error: NOTHING kept
--   2. 074a_plan_reads.sql            (this file)
--   3. 074a_plan_reads_verify.sql     read-only, one row
--   4. 074a_plan_reads_test.sql       OPTIONAL on production (writes TEST rows and undoes them all)
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it. 5 s lock timeout.
--
-- WHAT IT ADDS (the Worker of deploy 1 calls five of these; until day L each answers "nothing yet")
--   * plan_board(date,text): new keys only, never a renamed or retyped one (F4a requests, DECISION_LOG 26/10):
--       - hub[]: nat_to_location_id, load_from, load_to, deliver_from, deliver_to (E-26) and for_split (E-41/E-43).
--         The windows are v_shipments' (071): a national shipment carries them; a VS bridge copies nothing and
--         order_stops holds a DATE only (measured 28/10), so for a bridge they are null and its days are the
--         nat_ready_day / nat_due_day the item already has - never an invented time (principle 1);
--       - every cycle stop: is_hub (E-27 / E-44): Veroia named every week, with or without a VS on a truck;
--       - every legs[] item: price (the national's; null for a VS, which is invoiced as the international),
--         shipment_id, order_stop_id, pallet_exchange, goods, notes (E-34).
--     Three hooks, from the LIVE text (072 + 072b hook 10, md5 2e030bfc), md5 before and after, reversible byte for
--     byte (pattern 071 section 9 / 072b PART 6). CREATE OR REPLACE keeps the oid and the grants.
--   * shipment_pieces.for_split_at timestamptz NULL, set by ONE place: plan_move_pieces sending pieces back to
--     waiting where they then stand at the hub (the screen's "Split -> Veroia", target {wait:true}, all at Veroia;
--     one hook, live text 072 + 072b hooks 14/16, md5 97984f75), and cleared by ONE place: plan_h_leg_add, when a
--     cycle takes the piece again (one hook, live text of 072, md5 0d95758b). 071 locks only shipment_id /
--     parent_piece_id on a piece, so plan_chk lets the new column change.
--   * plan_lookups(text): the six catalogues with numeric ids for the v5 screens (E-2; drivers with phone, E-34).
--   * plan_config (EMPTY: 074 writes its one row on day L), plan_cutover_day() (NULL while empty) and
--     plan_config_read() (the Worker's GET /plan/config: {cutover_day:null, opened_at:null} until day L).
--   * order_delete_preview(text,text) (E-19): what deleting an international order takes off the v5 trucks, in the
--     shape of 072's two-step list. With 0 bridges (until 074) it is always empty, so deploy 1 deletes as today.
--   * plan_nat_state(bigint[]) (E3/E5, stream d1) and plan_activity(text,text) (E12/E13, stream d3): the readers of
--     the national orders list and of the partner / driver / vehicle / location cards. 0 v5 rows = empty answers.
-- NOT HERE: anything of day L (074: the row of plan_config, the bridge, the freeze), any trigger (B-54 unchanged).
--
-- REVERSE: 074a_plan_reads_rollback.sql (refuses once plan_config has its row or any v5 row exists).
-- EXPECTED: NOTICE "074a OK: ..." and ONE row: result = '074a OK', hooked_functions = 3, plan_config_rows = 0,
--   public_triggers = b54_red_value (unchanged), v5_rows = 0.

DO $do$
DECLARE
  v_g record; v_fn record; v_src text; v_new text; v_oid oid; v_acl text; v_def boolean; v_vol "char";
  v_lang oid; v_cfg text[];
  v_trg0 int; v_trg1 int; v_fns0 int; v_k bigint; v_n int := 0; v_j jsonb;

  -- ===== the hooks: (text before -> 074a text), each exactly once in its function =====
  -- E-34: what a leg is, for the cycle card and the sheet. price = the national's (a VS is invoiced as the
  -- international: null); goods / notes of the national, else of the VS stop. ONE read per leg (code review xhigh
  -- 28/10: five scalar reads before); the last fallback keeps the three keys on every leg, whatever happens
  h_brd_leg_a CONSTANT text := $h$                                       'temperature_c', vs.temperature_c) order by l.id)
$h$;
  h_brd_leg_b CONSTANT text := $h$                                       'temperature_c', vs.temperature_c,
                                       -- 074a (E-34)
                                       'shipment_id', vs.shipment_id, 'order_stop_id', vs.order_stop_id,
                                       'pallet_exchange', vs.pallet_exchange)
                                     || coalesce((select jsonb_build_object('price', n.price, 'goods', n.goods, 'notes', n.notes)
                                                    from national_orders n where n.id = vs.nat_order_id),
                                                 (select jsonb_build_object('price', null, 'goods', os.goods, 'notes', os.notes)
                                                    from order_stops os where os.id = vs.order_stop_id),
                                                 jsonb_build_object('price', null, 'goods', null, 'notes', null)) order by l.id)
$h$;
  -- E-27 / E-44: the hub is a fact of the base, on every stop
  h_brd_hub_a CONSTANT text := $h$                            'location', lo.name, 'planned_from', ss.planned_from, 'planned_to', ss.planned_to,
$h$;
  h_brd_hub_b CONSTANT text := $h$                            'location', lo.name, 'is_hub', coalesce(lo.is_hub, false),  -- 074a (E-27)
                            'planned_from', ss.planned_from, 'planned_to', ss.planned_to,
$h$;
  -- E-26 + E-41: where a hub[] item goes and when, and whether it was sent to Veroia to be split. The mark is the
  -- column itself: plan_h_leg_add clears it when a cycle takes the piece (hook 5), so no old mark survives a later
  -- cycle (code review xhigh 28/10: a rule on created_at depended on transaction start times)
  h_brd_bkt_a CONSTANT text := $h$                                                          'reference', vs.reference, 'temperature_c', vs.temperature_c)
$h$;
  h_brd_bkt_b CONSTANT text := $h$                                                          'reference', vs.reference, 'temperature_c', vs.temperature_c)
                       -- 074a (E-26, E-41)
                       || jsonb_build_object('nat_to_location_id', vs.nat_to_location_id,
                                             'load_from', vs.load_from, 'load_to', vs.load_to,
                                             'deliver_from', vs.deliver_from, 'deliver_to', vs.deliver_to,
                                             'for_split', (select sp.for_split_at is not null from shipment_pieces sp
                                                            where sp.id = hb.piece_id))
$h$;
  -- E-41: back to waiting AT THE HUB = sent to Veroia to be split (the screen's only "back" for loads that all pick
  -- up at Veroia, F4a plan). Pieces that went back elsewhere are not marked.
  h_mv_split_a CONSTANT text := $h$  perform plan_h_finish();
  return plan_h_ok('plan_move_pieces',
$h$;
  h_mv_split_b CONSTANT text := $h$  -- 074a (E-41): the pieces this move sent back to waiting that now stand at the hub were sent there to be
  -- split; the board reads the mark as hub[].for_split. The audit keeps the mark it replaces.
  if v_wait then
    for v_x in select ps.piece_id from v_piece_state ps where ps.piece_id = any (v_pieces) and ps.at_hub order by ps.piece_id loop
      perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', v_x::text,
                           (select jsonb_build_object('for_split_at', sp.for_split_at) from shipment_pieces sp where sp.id = v_x),
                           jsonb_build_object('for_split_at', now()));
      update shipment_pieces set for_split_at = now() where id = v_x;
    end loop;
  end if;
  perform plan_h_finish();
  return plan_h_ok('plan_move_pieces',
$h$;
  -- E-41: a cycle took the piece (the one place a leg is written, 072): it is no longer waiting to be split
  h_leg_add_a CONSTANT text := $h$  perform plan_h_audit(p_actor, p_role, 'create', 'piece_legs', l.id::text, null, to_jsonb(l));
$h$;
  h_leg_add_b CONSTANT text := $h$  perform plan_h_audit(p_actor, p_role, 'create', 'piece_legs', l.id::text, null, to_jsonb(l));
  -- 074a (E-41): a cycle took the piece, so it is no longer waiting at Veroia to be split
  if exists (select 1 from shipment_pieces where id = p_piece and for_split_at is not null) then
    perform plan_h_audit(p_actor, p_role, 'update', 'shipment_pieces', p_piece::text,
                         (select jsonb_build_object('for_split_at', sp.for_split_at) from shipment_pieces sp where sp.id = p_piece),
                         jsonb_build_object('for_split_at', null));
    update shipment_pieces set for_split_at = null where id = p_piece;
  end if;
$h$;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  -- 073b applied (the 17 checks B-78..B-94 and the auditor's read of the v5 tables)
  IF to_regclass('public.rt_vehicle_segments') IS NULL OR to_regclass('public.ct_v_v5_revenue') IS NULL
     OR (SELECT count(*) FROM monitoring.checks WHERE id IN ('B-78', 'B-79', 'B-80', 'B-81', 'B-82', 'B-83', 'B-84', 'B-85',
           'B-86', 'B-87', 'B-88', 'B-89', 'B-90', 'B-91', 'B-92', 'B-93', 'B-94')) <> 17
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shipment_pieces' AND policyname = 'monitor_read') THEN
    RAISE EXCEPTION '074a: 072b / 073 / 073b are not all applied - stop';
  END IF;
  IF to_regclass('public.plan_config') IS NOT NULL OR to_regprocedure('public.plan_lookups(text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'for_split_at') THEN
    RAISE EXCEPTION '074a: already applied (or half applied) - run 074a_plan_reads_verify.sql instead';
  END IF;
  IF (SELECT count(*) FROM public.locations WHERE is_hub) <> 1 THEN
    RAISE EXCEPTION '074a: not exactly one hub location - stop';
  END IF;
  -- The ADD COLUMN takes ACCESS EXCLUSIVE on shipment_pieces only there; the count and the change under one lock, so
  -- no v5 row commits in between (writes wait; a busy table = the 5 s lock timeout = stop, nothing done)
  LOCK TABLE public.ct_round_trips, public.rt_stops, public.shipments, public.shipment_pieces, public.piece_legs,
    public.plan_notices, public.rt_vehicle_segments IN SHARE ROW EXCLUSIVE MODE;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2)
       + (SELECT count(*) FROM public.rt_vehicle_segments)
    INTO v_k;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '074a: % v5 row(s) exist - 074a runs before day L, on 0 v5 rows; stop', v_k;
  END IF;
  -- Every function 074a calls and does NOT change, as live in production 28/10 (SELECT md5(prosrc), equal on the
  -- PGlite copy of 072 + 072b + 073 + 073b). Any difference = stop, re-measure. Proved again in PART 6.
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_token(text,text,jsonb)', '5ebb4630c920cf626c346dcc5aa2a34a'),
      ('public.plan_h_strip_amounts(jsonb,text)', 'cc19be0190b5b82d50ee8521cc7bee43'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'e370e52c9dd96d7e4e152b3ce348736e'),
      ('public.plan_h_rt_consequences(bigint)', 'cddea3a5fb20a563283a16db3b50f133'),
      ('public.plan_h_seg_of_stop(bigint)', 'd2522a02fe675ff8001925cd07e9b668')
    ) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '074a: % is not the live text of 28/10 (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- measured, never a constant (code review xhigh 28/10): PART 6 proves exactly five plan_* more than here
  SELECT count(*) INTO v_fns0 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%';

  -- ===== PART 1: THE COLUMN (E-41) =====
  ALTER TABLE public.shipment_pieces ADD COLUMN for_split_at timestamptz;
  COMMENT ON COLUMN public.shipment_pieces.for_split_at IS
    'Sent back to the hub to be split (plan_move_pieces, target wait, 074a). Read by plan_board hub[].for_split.';

  -- ===== PART 2: THE 5 HOOKS IN 3 FUNCTIONS (the live text + one replacement each; proved reversible). Applied in
  -- order k; the three in plan_board chain - the "before" of each is the "after" of the one before it - and the
  -- rollback undoes them in reverse order (k desc). =====
  FOR v_fn IN SELECT * FROM (VALUES
      (1, 'public.plan_board(date,text)', h_brd_leg_a, h_brd_leg_b,
       '2e030bfc158de8a26d5814f618d1f5ac', '86b4c66a4818d0c2aff51836b66b8c9f'),
      (2, 'public.plan_board(date,text)', h_brd_hub_a, h_brd_hub_b,
       '86b4c66a4818d0c2aff51836b66b8c9f', 'c18b72a7118b68d73d0af9b9caf08744'),
      (3, 'public.plan_board(date,text)', h_brd_bkt_a, h_brd_bkt_b,
       'c18b72a7118b68d73d0af9b9caf08744', 'fc33642e81560b42f217b80c98543467'),
      (4, 'public.plan_move_pieces(jsonb,text,text)', h_mv_split_a, h_mv_split_b,
       '97984f7500dead965ddcba0d2c3360ab', '9bfa8d7fc5978efe84cb5990309b076f'),
      (5, 'public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)', h_leg_add_a, h_leg_add_b,
       '0d95758b35f6095d42b551c287e3008b', 'c6f40152cd13f2ec502872e803c10b8e')
    ) v(k, sig, a, b, m0, m1) ORDER BY k LOOP
    v_oid := to_regprocedure(v_fn.sig);
    SELECT prosrc, proacl::text, prosecdef, provolatile, prolang, proconfig
      INTO v_src, v_acl, v_def, v_vol, v_lang, v_cfg FROM pg_proc WHERE oid = v_oid;
    IF md5(v_src) <> v_fn.m0 THEN
      RAISE EXCEPTION '074a: % is not the text expected before hook % (md5 %) - stop', v_fn.sig, v_fn.k, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_fn.a, ''))) <> length(v_fn.a) THEN
      RAISE EXCEPTION '074a: the place of hook % is not in % exactly once - stop', v_fn.k, v_fn.sig;
    END IF;
    v_new := replace(v_src, v_fn.a, v_fn.b);
    IF replace(v_new, v_fn.b, v_fn.a) <> v_src OR md5(v_new) <> v_fn.m1 THEN
      RAISE EXCEPTION '074a: the generated text of % (hook %) is not the one measured (md5 %) - stop', v_fn.sig, v_fn.k, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner, grants and callers; language, volatility and security are read from the
    -- live function, never assumed
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_fn.sig, '(', 1), pg_get_function_arguments(v_oid), pg_get_function_result(v_oid),
      CASE v_vol WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END,
      CASE WHEN v_def THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> v_fn.m1
       OR (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
       OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
       OR (SELECT provolatile FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_vol
       OR (SELECT prolang FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_lang
       OR (SELECT proconfig FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg THEN
      RAISE EXCEPTION '074a proof: % does not hold the generated text with its old rights and shape', v_fn.sig;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  -- ===== PART 3: plan_config, BORN EMPTY (074 writes its one row on day L; the shape is Task B1's) =====
  -- Day L is a Saturday (the TMS week) and lies after the day it was opened (Athens): a past L is refused by the
  -- table itself, whoever writes it. No trigger (B-54 unchanged): both rules are row CHECKs.
  CREATE TABLE public.plan_config (
    id smallint PRIMARY KEY CONSTRAINT plan_config_one CHECK (id = 1),
    cutover_day date NOT NULL CONSTRAINT plan_config_saturday CHECK (extract(isodow FROM cutover_day) = 6),
    opened_at timestamptz NOT NULL,
    opened_by text NOT NULL,
    CONSTRAINT plan_config_future CHECK (cutover_day > (opened_at AT TIME ZONE 'Europe/Athens')::date)
  );
  COMMENT ON TABLE public.plan_config IS 'National v5 day L: one row, written once by 074. Empty = before day L.';

  CREATE FUNCTION public.plan_cutover_day() RETURNS date
    LANGUAGE sql STABLE SET search_path = public AS $f$
  -- Day L, ONE source (principle 3): every guard, trigger and check of 074 reads it here. NULL = before day L.
  select c.cutover_day from plan_config c where c.id = 1
$f$;

  CREATE FUNCTION public.plan_config_read() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
begin
  -- GET /plan/config (Worker deploy 1). Both keys always, null before day L: the screens tell "before" from a
  -- failed read by the answer itself, never by a missing key (principle 1).
  return coalesce((select jsonb_build_object('cutover_day', c.cutover_day, 'opened_at', c.opened_at)
                     from plan_config c where c.id = 1),
                  jsonb_build_object('cutover_day', null, 'opened_at', null));
end
$f$;

  -- ===== PART 4: THE CATALOGUES (E-2) AND THE DELETE PREVIEW (E-19) =====
  CREATE FUNCTION public.plan_lookups(p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
begin
  -- The v5 screens hold rec... legacy ids; /plan/* wants the numeric ids (core/plan-ids.js). Live rows only, every
  -- list always present (the screen refuses a catalogue with a missing list). The same answer for every role: no
  -- amount, no price here. locations has no "active" column (measured 28/10): a live place is active.
  if p_role is null or p_role not in ('owner', 'dispatcher', 'management', 'accountant', 'warehouse') then
    perform plan_h_raise('bad_input', 'role');
  end if;
  return jsonb_build_object(
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id, 'name', x.name,
                             'address', x.address, 'city', x.city, 'phone', x.phone, 'is_hub', x.is_hub, 'active', true)
                             order by x.id) from locations x where x.deleted_at is null), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id,
                           'company_name', x.company_name, 'active', x.active) order by x.id)
                           from clients x where x.deleted_at is null), '[]'::jsonb),
    'trucks', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id,
                          'license_plate', x.license_plate, 'active', x.active) order by x.id)
                          from trucks x where x.deleted_at is null), '[]'::jsonb),
    'trailers', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id,
                            'license_plate', x.license_plate, 'active', x.active) order by x.id)
                            from trailers x where x.deleted_at is null), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id,
                           'full_name', x.full_name, 'phone', x.phone, 'active', x.active) order by x.id)
                           from drivers x where x.deleted_at is null), '[]'::jsonb),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'legacy_id', x.legacy_id,
                            'company_name', x.company_name, 'active', x.active) order by x.id)
                            from partners x where x.deleted_at is null), '[]'::jsonb));
end
$f$;

  CREATE FUNCTION public.order_delete_preview(p_order_legacy_id text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
declare v_order bigint; v_legs bigint[]; v_full jsonb;
begin
  -- E-19: what deleting an international order (DELETE /orders/:id -> delete_order_cascade, unchanged) takes off the
  -- v5 trucks, BEFORE it happens: the pieces of its VS bridges on cycles (piece_on_rt) and 072's list for legs that
  -- go (cycles that empty with their payroll and costs, executed legs, local loadings). Read only: the Worker asks
  -- first, shows a non-empty list (428) and deletes with the token; a changed list = another token (stale_confirm).
  -- p_role: amounts only to owner / accountant (plan_h_strip_amounts, decision 9); the token is the same for every
  -- role and hashes no amount (plan_h_token). An unknown or deleted order has nothing on a truck: the empty answer
  -- (the delete keeps its own 404). The cascade also soft-deletes the national orders sourced by the order
  -- (national_orders.source_order_id, live delete_order_cascade 28/10): their v5 pieces on cycles are listed too
  -- (code review xhigh 28/10), so nothing leaves a truck without the list.
  if p_role is null or p_role not in ('owner', 'dispatcher', 'management', 'accountant', 'warehouse') then
    perform plan_h_raise('bad_input', 'role');
  end if;
  if p_order_legacy_id is null or btrim(p_order_legacy_id) = '' then perform plan_h_raise('bad_input', 'order'); end if;
  select o.id into v_order from orders o where o.legacy_id = p_order_legacy_id and o.deleted_at is null;
  select coalesce(array_agg(l.id order by l.id), '{}') into v_legs
    from piece_legs l join shipment_pieces sp on sp.id = l.piece_id join shipments s on s.id = sp.shipment_id
   where l.deleted_at is null
     and (s.order_id = v_order
          or s.nat_order_id in (select n.id from national_orders n where n.source_order_id = v_order and n.deleted_at is null));
  v_full := plan_h_drop_consequences(v_legs, null)
    || coalesce((select jsonb_agg(jsonb_build_object('kind', 'piece_on_rt', 'leg_id', l.id, 'piece_id', l.piece_id,
                                                     'rt_id', l.rt_id, 'code', c.code, 'order_stop_id', s.order_stop_id,
                                                     'nat_order_id', s.nat_order_id))
                   from piece_legs l join ct_round_trips c on c.id = l.rt_id
                   join shipment_pieces sp on sp.id = l.piece_id join shipments s on s.id = sp.shipment_id
                  where l.id = any (v_legs)), '[]'::jsonb);
  -- one order (kind, then the item), as plan_delete: the token does not depend on how the list was assembled
  select coalesce(jsonb_agg(c order by c->>'kind', c::text), '[]'::jsonb) into v_full from jsonb_array_elements(v_full) c;
  return jsonb_build_object('ok', true, 'op', 'order_delete_preview', 'order_id', v_order,
    'needs_confirm', jsonb_array_length(v_full) > 0,
    'confirm_token', case when jsonb_array_length(v_full) > 0
                          then plan_h_token('order_delete_preview', v_order::text, v_full) end,
    'consequences', plan_h_strip_amounts(v_full, p_role));
end
$f$;

  -- E3 / E5 (stream d1, spec docs/national-v5/f5/d1-orders-read-spec.md section 2): what the national orders list
  -- and "Week" show of a v5 national order - its state and who carries it. The shape of plan_vs_state (072).
  CREATE FUNCTION public.plan_nat_state(p_nat_order_ids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
begin
  -- "missing" = no row in v_national_order_state (no live v5 piece: an order of the old model). No amount here.
  -- carriers: one per (cycle, side of the pickup stop) of the order's live legs on live v5 cycles, the vehicle of
  -- the segment that executes the first pickup (THE rule, plan_h_seg_of_stop, H-9 - as plan_vs_state since 072b),
  -- the day = the Athens day of that pickup. Every live piece counts, a split parent too (its leg to Veroia).
  if p_nat_order_ids is null then return '{}'::jsonb; end if;
  if cardinality(p_nat_order_ids) > 500 then perform plan_h_raise('bad_input', 'more than 500 nat order ids'); end if;
  -- the view walks every piece (v_piece_pos is recursive): read it ONCE for the asked ids, never once per id
  return coalesce((
    with st as materialized (select * from v_national_order_state where nat_order_id = any (p_nat_order_ids))
    select jsonb_object_agg(o::text, coalesce((
             select jsonb_build_object(
                      'n_pieces', v.n_pieces, 'n_executed', v.n_executed, 'executed', v.executed,
                      'planned', v.planned, 'late', v.late,
                      'hub_side', (select case when bool_and(vs.nat_to_location_id = hub.id) then 'ANODOS'
                                               when bool_and(vs.nat_from_location_id = hub.id) then 'KATHODOS' end
                                     from v_shipments vs join locations hub on hub.is_hub
                                    where vs.nat_order_id = o and vs.live),
                      'carriers', coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'kind', case when g.trip_type = 'PARTNER' then 'partner'
                                              when g.truck_id is null then 'none' else 'owned' end,
                                 'truck', tr.license_plate, 'trailer', tl.license_plate, 'driver', dv.full_name,
                                 'partner', pa.company_name, 'code', c.code, 'side', c.side,
                                 'day', (c.first_from at time zone 'Europe/Athens')::date)
                               order by (c.first_from at time zone 'Europe/Athens')::date, c.code)
                          from (select distinct on (l.rt_id, pk.side) l.rt_id, r.code, pk.side, pk.id as pickup_stop,
                                       pk.planned_from as first_from
                                  from shipments s
                                  join shipment_pieces sp on sp.shipment_id = s.id and sp.deleted_at is null
                                  join piece_legs l on l.piece_id = sp.id and l.deleted_at is null
                                  join rt_stops pk on pk.id = l.pickup_stop_id
                                  join ct_round_trips r on r.id = l.rt_id and r.model = 2 and r.status <> 'cancelled'
                                 where s.nat_order_id = o and s.deleted_at is null
                                 order by l.rt_id, pk.side, pk.planned_from, l.id) c
                          left join rt_vehicle_segments g on g.id = plan_h_seg_of_stop(c.pickup_stop)
                          left join trucks tr on tr.id = g.truck_id
                          left join trailers tl on tl.id = g.trailer_id
                          left join drivers dv on dv.id = g.driver_id
                          left join partners pa on pa.id = g.partner_id), '[]'::jsonb))
               from st v where v.nat_order_id = o), '"missing"'::jsonb))
      from unnest(p_nat_order_ids) o), '{}'::jsonb);
end
$f$;

  -- E12 / E13 (stream d3, spec f5-d3-entities-read-spec.md 2.2 (a)(c)(d), cut by its section 7 on 28/10): the v5
  -- activity of one partner / driver / truck / trailer, of one location, or the sides of every location.
  CREATE FUNCTION public.plan_activity(p_kind text, p_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
declare v_id bigint; v_j jsonb; v_j_ship jsonb; v_n int; v_m int;
begin
  -- Money: partner_rate of the segment only (decision 41: every role sees it). Cancelled cycles are IN for a vehicle
  -- or partner (the card shows them "Cancelled" and does not count them), OUT of the location sides. Limits: 500
  -- cycles or stops, 2000 national shipments of a location, truncated:true when one is reached - never a silent cut.
  if p_kind is null or p_kind not in ('partner', 'driver', 'truck', 'trailer', 'location') then
    perform plan_h_raise('bad_input', 'kind');
  end if;
  if p_id = 'all' then
    if p_kind <> 'location' then perform plan_h_raise('bad_input', 'all:' || p_kind); end if;
    return jsonb_build_object('sides', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', x.location_id, 'kathodos', x.k, 'anodos', x.a) order by x.location_id)
        from (select ss.location_id, count(*) filter (where ss.side = 'KATHODOS') as k,
                     count(*) filter (where ss.side = 'ANODOS') as a
                from v_rt_stop_state ss where ss.rt_status <> 'cancelled' group by ss.location_id) x), '[]'::jsonb));
  end if;
  -- a positive id of at most 9 digits, as the Worker sends it (never a cast error, never a sign or a space)
  if p_id is null or p_id !~ '^[1-9][0-9]{0,8}$' then perform plan_h_raise('bad_input', 'id'); end if;
  v_id := p_id::bigint;
  if p_kind <> 'location' then
    select coalesce(jsonb_agg(c.j order by c.start_at desc, c.rt_id desc), '[]'::jsonb), count(*) into v_j, v_n
      from (select vc.rt_id, vc.start_at,
                   jsonb_build_object('rt_id', vc.rt_id, 'code', vc.code, 'status', vc.status,
                     'start_at', vc.start_at, 'end_at', vc.end_at, 'ended', vc.ended,
                     'route_text', (select rr.route_text from dl_v_rt_route rr where rr.rt_id = vc.rt_id),
                     -- the live segments of the cycle with the entity in them; "first" = it starts the cycle (072b
                     -- keeps the first segment's from_at = the cycle's start_at). The table, not v_rt_segments: that
                     -- view numbers every segment of every cycle (a window) before any filter
                     'segs', (select jsonb_agg(jsonb_build_object('from_at', g.from_at, 'to_at', g.to_at,
                                'trip_type', g.trip_type, 'first', g.from_at = vc.start_at, 'truck_id', g.truck_id,
                                'trailer_id', g.trailer_id, 'driver_id', g.driver_id, 'partner_id', g.partner_id,
                                'partner_rate', g.partner_rate) order by g.from_at, g.id)
                                from rt_vehicle_segments g
                               where g.rt_id = vc.rt_id and g.deleted_at is null
                                 and v_id = case p_kind when 'partner' then g.partner_id when 'driver' then g.driver_id
                                                        when 'truck' then g.truck_id else g.trailer_id end)) as j
              from v_rt_cycle vc
             where vc.rt_id in (select g.rt_id from rt_vehicle_segments g where g.deleted_at is null
                                  and v_id = case p_kind when 'partner' then g.partner_id when 'driver' then g.driver_id
                                                         when 'truck' then g.truck_id else g.trailer_id end)
             order by vc.start_at desc, vc.rt_id desc
             limit 501) c;
    -- 501 read, 500 answered: the 501st only says that more exist
    if v_n > 500 then v_j := v_j - 500; end if;
    return jsonb_build_object('cycles', v_j, 'truncated', v_n > 500);
  end if;
  select coalesce(jsonb_agg(c.j order by c.planned_from desc, c.stop_id desc), '[]'::jsonb), count(*) into v_j, v_n
    from (select ss.stop_id, ss.planned_from,
                 jsonb_build_object('stop_id', ss.stop_id, 'rt_id', ss.rt_id, 'code', ss.code, 'side', ss.side,
                   'planned_from', ss.planned_from, 'planned_to', ss.planned_to, 'executed', ss.executed,
                   'rt_status', ss.rt_status,
                   -- the segment that executes the stop (H-9); a stop outside every segment shows the cycle's copy
                   'carrier', coalesce((select jsonb_build_object('trip_type', g.trip_type, 'truck_id', g.truck_id,
                                                                  'partner_id', g.partner_id)
                                          from rt_vehicle_segments g where g.id = plan_h_seg_of_stop(ss.stop_id)),
                                       (select jsonb_build_object('trip_type', r.trip_type, 'truck_id', r.truck_id,
                                                                  'partner_id', r.partner_id)
                                          from ct_round_trips r where r.id = ss.rt_id)),
                   'loads', coalesce((select jsonb_agg(jsonb_build_object(
                              'act', case when l.pickup_stop_id = ss.stop_id then 'pickup' else 'drop' end,
                              'shipment_id', vs.shipment_id, 'kind', vs.kind, 'order_id', vs.order_id,
                              'nat_order_id', vs.nat_order_id, 'reference', vs.reference, 'client_id', vs.client_id,
                              'pallets', sp.pallets) order by l.id)
                              from piece_legs l
                              join shipment_pieces sp on sp.id = l.piece_id
                              join v_shipments vs on vs.shipment_id = sp.shipment_id
                             where l.deleted_at is null and (l.pickup_stop_id = ss.stop_id or l.drop_stop_id = ss.stop_id)),
                            '[]'::jsonb)) as j
            from v_rt_stop_state ss where ss.location_id = v_id
           order by ss.planned_from desc, ss.stop_id desc
           limit 501) c;
  if v_n > 500 then v_j := v_j - 500; end if;
  -- the national shipments that start or end here (VS bridges stay out: their international stop is the record)
  select coalesce(jsonb_agg(x.j order by x.day desc, x.shipment_id desc), '[]'::jsonb), count(*) into v_j_ship, v_m
    from (select vs.shipment_id, case when vs.origin_location_id = v_id then vs.nat_ready_day else vs.nat_due_day end as day,
                 jsonb_build_object('shipment_id', vs.shipment_id, 'nat_order_id', vs.nat_order_id,
                   'reference', vs.reference, 'client_id', vs.client_id, 'pallets', vs.pallets,
                   'end', case when vs.origin_location_id = v_id then 'origin' else 'dest' end,
                   'day', case when vs.origin_location_id = v_id then vs.nat_ready_day else vs.nat_due_day end) as j
            from v_shipments vs
           where vs.kind = 'national' and vs.live and (vs.origin_location_id = v_id or vs.dest_location_id = v_id)
           order by 2 desc, vs.shipment_id desc
           limit 2001) x;
  if v_m > 2000 then v_j_ship := v_j_ship - 2000; end if;
  return jsonb_build_object('stops', v_j, 'shipments', v_j_ship, 'truncated', v_n > 500 or v_m > 2000);
end
$f$;

  -- ===== PART 5: BORN CLOSED (principle 5: postgres' default ACL gives EXECUTE to anon / authenticated and a new
  -- table's arwxtm to service_role) =====
  ALTER TABLE public.plan_config ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.plan_config FROM PUBLIC, anon, authenticated, service_role;
  -- SELECT only; nobody writes through the API (074 writes the row as postgres). The auditor reads it (D-14 rule).
  GRANT SELECT ON public.plan_config TO service_role, tms_reader, tms_check_runner;
  CREATE POLICY monitor_read ON public.plan_config FOR SELECT TO tms_check_runner, tms_reader USING (true);
  REVOKE ALL ON FUNCTION public.plan_cutover_day(), public.plan_config_read(), public.plan_lookups(text),
    public.order_delete_preview(text,text), public.plan_nat_state(bigint[]), public.plan_activity(text,text)
    FROM PUBLIC, anon, authenticated, service_role;
  -- the five the Worker of deploy 1 calls
  GRANT EXECUTE ON FUNCTION public.plan_config_read(), public.plan_lookups(text), public.order_delete_preview(text,text),
    public.plan_nat_state(bigint[]), public.plan_activity(text,text)
    TO service_role;
  -- day L itself (a date, no secret): 074's triggers fire as the role that writes (service_role through the facade)
  -- and 074b's checks run as the auditor's roles; without this a trigger that is not SECURITY DEFINER would answer a
  -- raw 42501 on day L instead of its plan: code (code review xhigh 28/10)
  GRANT EXECUTE ON FUNCTION public.plan_cutover_day() TO service_role, tms_check_runner, tms_reader;

  -- ===== PART 6: PROOFS =====
  IF v_n <> 5 THEN RAISE EXCEPTION '074a proof: % hooks applied (expected 5)', v_n; END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_token(text,text,jsonb)', '5ebb4630c920cf626c346dcc5aa2a34a'),
      ('public.plan_h_strip_amounts(jsonb,text)', 'cc19be0190b5b82d50ee8521cc7bee43'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'e370e52c9dd96d7e4e152b3ce348736e'),
      ('public.plan_h_rt_consequences(bigint)', 'cddea3a5fb20a563283a16db3b50f133'),
      ('public.plan_h_seg_of_stop(bigint)', 'd2522a02fe675ff8001925cd07e9b668')
    ) g(sig, m) LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '074a proof: % changed', v_g.sig;
    END IF;
  END LOOP;
  IF (SELECT format_type(atttypid, atttypmod) || ':' || attnotnull::text FROM pg_attribute
       WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'for_split_at') IS DISTINCT FROM 'timestamp with time zone:false' THEN
    RAISE EXCEPTION '074a proof: shipment_pieces.for_split_at is not a nullable timestamptz';
  END IF;
  IF (SELECT count(*) FROM public.plan_config) <> 0 OR public.plan_cutover_day() IS NOT NULL
     OR public.plan_config_read() IS DISTINCT FROM '{"cutover_day": null, "opened_at": null}'::jsonb THEN
    RAISE EXCEPTION '074a proof: plan_config is not empty, or its readers do not say "before day L"';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plan_config'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plan_config') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plan_config'
                     AND policyname = 'monitor_read' AND cmd = 'SELECT'
                     AND roles::text[] @> ARRAY['tms_check_runner', 'tms_reader'] AND cardinality(roles) = 2)
     OR has_table_privilege('anon', 'public.plan_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.plan_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('service_role', 'public.plan_config', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR NOT has_table_privilege('service_role', 'public.plan_config', 'SELECT') THEN
    RAISE EXCEPTION '074a proof: plan_config is not RLS on + monitor_read + SELECT only for service_role';
  END IF;
  SELECT count(*) INTO v_k FROM unnest(ARRAY['public.plan_cutover_day()', 'public.plan_config_read()',
      'public.plan_lookups(text)', 'public.order_delete_preview(text,text)', 'public.plan_nat_state(bigint[])',
      'public.plan_activity(text,text)']) f(sig)
   WHERE has_function_privilege('anon', f.sig, 'EXECUTE') OR has_function_privilege('authenticated', f.sig, 'EXECUTE')
      OR NOT has_function_privilege('service_role', f.sig, 'EXECUTE')
      OR has_function_privilege('tms_check_runner', f.sig, 'EXECUTE') <> (f.sig = 'public.plan_cutover_day()')
      OR has_function_privilege('tms_reader', f.sig, 'EXECUTE') <> (f.sig = 'public.plan_cutover_day()');
  IF v_k <> 0 THEN RAISE EXCEPTION '074a proof: % new function(s) with the wrong EXECUTE rights', v_k; END IF;
  v_j := public.plan_lookups('warehouse');
  IF (SELECT count(*) FROM jsonb_object_keys(v_j) k
       WHERE k IN ('locations', 'clients', 'trucks', 'trailers', 'drivers', 'partners') AND jsonb_typeof(v_j->k) = 'array') <> 6
     OR (SELECT count(*) FROM jsonb_array_elements(v_j->'locations') x WHERE (x->>'is_hub')::boolean) <> 1 THEN
    RAISE EXCEPTION '074a proof: plan_lookups does not answer six lists with exactly one hub';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%') <> v_fns0 + 5 THEN
    RAISE EXCEPTION '074a proof: plan_* count is not % + 5', v_fns0;
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2)
       + (SELECT count(*) FROM public.rt_vehicle_segments)
    INTO v_k;
  IF v_k <> 0 THEN RAISE EXCEPTION '074a proof: % v5 row(s)', v_k; END IF;
  -- B-54: no trigger added, none lost
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1::numeric THEN
    RAISE EXCEPTION '074a proof: trigger count % -> % or B-54 % (expected all equal)', v_trg0, v_trg1,
      (SELECT red_value FROM monitoring.checks WHERE id = 'B-54');
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '074a OK: 5 hooks (plan_board x3, plan_move_pieces x1, plan_h_leg_add x1), for_split_at, plan_config empty, plan_lookups, plan_config_read, order_delete_preview, plan_nat_state, plan_activity; triggers % = B-54, v5 rows 0',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.plan_lookups(text)') IS NOT NULL THEN '074a OK' ELSE '074a NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%-- 074a (E-%'
         AND proname IN ('plan_board', 'plan_move_pieces', 'plan_h_leg_add')) AS hooked_functions,
       (SELECT count(*) FROM public.plan_config) AS plan_config_rows,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
         + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices)
         + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_rows;
