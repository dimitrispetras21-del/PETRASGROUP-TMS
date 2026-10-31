-- 086 - NATIONAL v5: A BUSY TRUCK / DRIVER IS ALLOWED WHEN THE SAVE ACCEPTS IT; AN ALL-DAY DROP FOLLOWS ITS PICKUP
-- (owner 1/11, "ok" to P-5 of PR #184: relaxed rules - allowed with a trace and a warning; only data integrity refuses).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
-- NEEDS 084 APPLIED (#188): plan_h_busy and plan_move_pieces are patched on the texts 084 writes. Order: 084 -> 086.
-- Independent of 083 (#186): 083 patches plan_rt_create only, 086 does not touch it.
--
-- 1. BUSY. Today a truck or a driver on two trips at once is refused twice: early by plan_h_busy (it names the other
--    trip) and at COMMIT by the deferred EXCLUDE rt_v2_truck_once / rt_v2_driver_once (072b, on rt_vehicle_segments).
--    The planner's windows are approximate (a load of the next trip with its own loading at 09:00, the trip before it
--    ending at 14:00), and the owner allows the overlap when the person saving says so. An overlap passes ONLY when a
--    save accepted it, PAIR BY PAIR; THE RULE STAYS IN THE BASE (principle 4):
--      - rt_vehicle_segments.overlap_rts (bigint[], default '{}'): the trips this segment was accepted to overlap. It
--        is filled only inside a save that carried accept_busy: true (the screen's second press, "save anyway", after
--        the first answer was truck_busy / driver_busy), by the BEFORE trigger plan_seg_overlap_mark, with the trips it
--        really overlaps then; one audit_log row per fill: who, role, which segment, which trips;
--      - the two EXCLUDE are rebuilt with the same names, PARTIAL: WHERE overlap_rts = '{}'. Two segments that named
--        nothing are refused at COMMIT exactly as today;
--      - a pair where one side named something is checked at COMMIT by the deferred constraint trigger
--        plan_seg_overlap_verify: refused (truck_busy / driver_busy, the same codes and texts) unless one side names
--        the other's trip. So a later write that makes a NEW overlap with an accepted segment - a load added to a trip,
--        a stop's time moved - is refused like any other, never let through because the other side was accepted once;
--      - an accepted pair stays accepted when the times move later (no name is ever removed by the base); the early
--        check plan_h_busy still asks again on every new trip and every vehicle change of a trip (it reads every
--        segment), and "save anyway" answers it;
--      - a save without accept_busy is refused exactly as today; two segments of the SAME trip are never named.
-- 2. STOP ORDER. 081's road order sorts a trip's stops by planned_from first. An all-day drop at a client (00:00-23:59)
--    on the day of its own Veroia loading (16:00-18:00) sorted BEFORE that loading, and 071 refused it (leg_order).
--    plan_h_reseq now moves a drop to right after the last of its own pickups (leg_order: a piece is never delivered
--    before it is loaded - that stays a refusal, it is integrity). Then the drop's 00:00 is earlier than the loading's
--    16:00 ahead of it, which 071 stop_order refused: stop_order now refuses only a stop that ENDS before the stop ahead
--    of it STARTS (an order no truck can drive); overlapping windows are a plan, not an error. This holds for any two
--    stops in seq order, the ANODOS after the KATHODOS too (side_order is unchanged).
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 084 applied (plan_h_busy and plan_move_pieces = 084's texts), the LIVE texts of plan_h_target,
--           plan_rt_update, plan_rt_problem and plan_h_reseq (081), the two EXCLUDE as 072b made them, nothing of 086
--           yet, day L, B-54 = the enabled triggers
--   PART 1  schema: rt_vehicle_segments.overlap_rts (NOT NULL DEFAULT '{}': every row empty, no row rewritten); the two
--           EXCLUDE rebuilt partial, same names, same columns, DEFERRABLE INITIALLY DEFERRED; plan_h_accept_busy (reads
--           accept_busy, sets three transaction-local settings); plan_seg_overlap_mark + its BEFORE trigger (the names
--           and the audit row); plan_chk_seg_overlap + its deferred constraint trigger (the pair rule); B-54 = measured + 2
--   PART 2  live text + hunks: plan_h_busy (an accepted save is not refused early), plan_h_target, plan_move_pieces and
--           plan_rt_update (accept_busy is a known key, read by plan_h_accept_busy), plan_rt_problem (stop_order),
--           plan_h_reseq (a drop after its pickup)
--   PART 3  proofs, NOTICE "086 OK: ..."
-- No row is written by this file (the new column is empty everywhere). No Worker change: the Worker passes the body as
-- it is and already answers truck_busy / driver_busy for the three layers (plan: hint or constraint name).
-- RUN: 086_plan_busy_overlap_ok_dryrun.sql, then this file, then 086_plan_busy_overlap_ok_verify.sql.
-- REVERSE: 086_plan_busy_overlap_ok_rollback.sql (it STOPS and lists the trips if an accepted overlap is in the base:
-- the full EXCLUDE could not be rebuilt over it).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  b_1a CONSTANT text := $h$  if v_code is null then return; end if;
$h$;
  b_1b CONSTANT text := $h$  if v_code is null then return; end if;
  -- 086 (owner 1/11): a save that accepted the overlap (accept_busy: true, the screen's "save anyway") is not refused
  -- here; plan_seg_overlap_mark names the trips on the segments it writes (audit row), the COMMIT rules check the pairs
  if current_setting('plan.accept_busy', true) = '1' then return; end if;
$h$;
  t_1a CONSTANT text := $h$  perform plan_h_keys(p_target, array['rt_id', 'side', 'new_rt'], 'target');
$h$;
  t_1b CONSTANT text := $h$  perform plan_h_keys(p_target, array['rt_id', 'side', 'new_rt', 'accept_busy'], 'target');
  -- 086: target.accept_busy = true lets this save overlap another trip of the same truck / driver, with a trace
  perform plan_h_accept_busy(p_target, 'target', p_actor, p_role);
$h$;
  m_1a CONSTANT text := $h$    perform plan_h_keys(p->'target', array['rt_id', 'side', 'new_rt'], 'target');
$h$;
  m_1b CONSTANT text := $h$    -- 086: accept_busy is plan_h_target's key (read there, at execution)
    perform plan_h_keys(p->'target', array['rt_id', 'side', 'new_rt', 'accept_busy'], 'target');
$h$;
  u_1a CONSTANT text := $h$  perform plan_h_keys(p, array['rt_id', 'set', 'stops', 'shift', 'dry_run', 'confirm_token'], 'p');
$h$;
  u_1b CONSTANT text := $h$  perform plan_h_keys(p, array['rt_id', 'set', 'stops', 'shift', 'dry_run', 'confirm_token', 'accept_busy'], 'p');
  -- 086: accept_busy = true lets this change overlap another trip of the same truck / driver, with a trace
  perform plan_h_accept_busy(p, 'p', p_actor, p_role);
$h$;
  o_1a CONSTANT text := $h$and b.planned_from < a.planned_from) then
$h$;
  o_1b CONSTANT text := $h$and b.planned_to <= a.planned_from) then
    -- 086 (owner 1/11): only a stop that ENDS before the stop ahead of it starts; overlapping windows (an all-day
    -- drop after its own 16:00 loading) are a plan, not an error
$h$;
  r_1a CONSTANT text := $h$  v_hla float8; v_hlo float8;
$h$;
  r_1b CONSTANT text := $h$  v_hla float8; v_hlo float8;
  v_i int; v_dpos int; v_ppos int;  -- 086: a drop moved after its own pickup
$h$;
  r_2a CONSTANT text := $h$  for r in select s.id, s.seq, o.n as rn
$h$;
  r_2b CONSTANT text := $h$  -- 086 (owner 1/11): an all-day drop on the day of its own pickup (00:00-23:59 at a client, the Veroia loading
  -- 16:00) sorted before that pickup by its 00:00, and 071 refused it (leg_order). A drop never runs before its own
  -- pickup: it moves to right after the last of its pickups; the hour order stays for everything else. Bounded: a
  -- chain the loop cannot settle is left as it is, and 071 leg_order refuses it at COMMIT as before.
  for v_i in 1 .. 2 * coalesce(cardinality(v_ord), 0) loop
    v_dpos := null; v_ppos := null;
    select o.n::int, max(op.n)::int into v_dpos, v_ppos
      from unnest(v_ord) with ordinality o(id, n)
      join piece_legs lg on lg.drop_stop_id = o.id and lg.deleted_at is null and lg.pickup_stop_id <> o.id
      join unnest(v_ord) with ordinality op(id, n) on op.id = lg.pickup_stop_id and op.n > o.n
     group by o.n order by o.n limit 1;
    exit when v_dpos is null;
    v_ord := v_ord[1:v_dpos - 1] || v_ord[v_dpos + 1:v_ppos] || v_ord[v_dpos] || v_ord[v_ppos + 1:cardinality(v_ord)];
  end loop;
  for r in select s.id, s.seq, o.n as rn
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '086: day L is not set (074 / 079) - stop';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'))
     = '99d86d5c59c88264b4825b5410c09a59' THEN
    RAISE EXCEPTION '086: 084 is not applied (order 084 -> 086) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', '285ca0f03cae41e3ddbc22bf41ccfb8b'),
      ('public.plan_h_target(jsonb,jsonb,text,text)', 'aa5c32e3968e1a0f141bdb4c568528ca'),
      ('public.plan_move_pieces(jsonb,text,text)', '70e21dad2a56d7db294e45ac592ed380'),
      ('public.plan_rt_update(jsonb,text,text)', 'be70612fb940356278c7c66705c8ee33'),
      ('public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'),
      ('public.plan_h_reseq(bigint,text,text)', 'f246c362c3f3bb1746a1d536ad1338bb')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '086: % is not its live text of 1/11 (086 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_rts')
     OR to_regprocedure('public.plan_h_accept_busy(jsonb,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.plan_seg_overlap_mark()') IS NOT NULL
     OR to_regprocedure('public.plan_chk_seg_overlap()') IS NOT NULL THEN
    RAISE EXCEPTION '086: overlap_rts or one of its functions already exists (086 already applied?) - stop';
  END IF;
  -- the two EXCLUDE exactly as 072b made them (md5 of pg_get_constraintdef, measured live 1/11)
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_truck_once') IS DISTINCT FROM '1add7b5c9ebb0e17af7d07d2f9318d18'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_driver_once') IS DISTINCT FROM '46bdb9fa06b5bb49158987491951ffe3' THEN
    RAISE EXCEPTION '086: rt_v2_truck_once / rt_v2_driver_once are not the EXCLUDE of 072b - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '086: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: SCHEMA =====
  -- a constant default: no table rewrite, every existing segment names nothing (= checked by both EXCLUDE, as today)
  ALTER TABLE public.rt_vehicle_segments ADD COLUMN overlap_rts bigint[] NOT NULL DEFAULT '{}';
  COMMENT ON COLUMN public.rt_vehicle_segments.overlap_rts IS
    '086 (owner 1/11): the trips (ct_round_trips.id) this segment was accepted to overlap - same truck or driver - by a save that sent accept_busy (audit_log row by plan_seg_overlap_mark). Empty = checked by the two EXCLUDE; named = the pair rule plan_chk_seg_overlap at COMMIT. The base never removes a name.';
  -- the same two rules, same names, same columns and range; a segment that names a trip is left to the pair rule
  ALTER TABLE public.rt_vehicle_segments DROP CONSTRAINT rt_v2_truck_once, DROP CONSTRAINT rt_v2_driver_once,
    ADD CONSTRAINT rt_v2_truck_once EXCLUDE USING gist (truck_id WITH =, tstzrange(from_at, greatest(from_at, to_at), '[)') WITH &&)
      WHERE (trip_type = 'OWNED' AND truck_id IS NOT NULL AND deleted_at IS NULL AND NOT rt_cancelled AND overlap_rts = '{}')
      DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT rt_v2_driver_once EXCLUDE USING gist (driver_id WITH =, tstzrange(from_at, greatest(from_at, to_at), '[)') WITH &&)
      WHERE (trip_type = 'OWNED' AND driver_id IS NOT NULL AND deleted_at IS NULL AND NOT rt_cancelled AND overlap_rts = '{}')
      DEFERRABLE INITIALLY DEFERRED;

  -- accept_busy of a target or of plan_rt_update's body: a boolean or nothing (an unknown value is refused, never read
  -- as false). true = three transaction-local settings, read by plan_h_busy (no early refusal) and by the trigger below;
  -- anything else empties them, so an acceptance never outlives the call that sent it (one transaction may hold more
  -- than one plan_* call: a test, a script)
  CREATE FUNCTION public.plan_h_accept_busy(p jsonb, p_what text, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  if p is not null and p ? 'accept_busy' and jsonb_typeof(p->'accept_busy') <> 'boolean' then
    perform plan_h_raise('bad_input', p_what || '.accept_busy');
  end if;
  if p is not null and coalesce((p->>'accept_busy')::boolean, false) then
    perform set_config('plan.accept_busy', '1', true);
    perform set_config('plan.accept_actor', coalesce(p_actor, ''), true);
    perform set_config('plan.accept_role', coalesce(p_role, ''), true);
  else
    perform set_config('plan.accept_busy', '', true);
  end if;
end
$f$;

  -- the names: inside an accepting save only, on a live OWNED segment, the trips of the live OWNED segments of the same
  -- truck or driver it overlaps and does not name yet (another trip only); one audit_log row each time names are added
  CREATE FUNCTION public.plan_seg_overlap_mark() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_add bigint[]; v_with jsonb;
begin
  if coalesce(current_setting('plan.accept_busy', true), '') <> '1'
     or new.deleted_at is not null or new.rt_cancelled or new.trip_type is distinct from 'OWNED' then
    return new;
  end if;
  select array_agg(distinct g.rt_id order by g.rt_id),
         jsonb_agg(distinct jsonb_build_object('rt_code', r.code, 'by', case when g.truck_id = new.truck_id then 'truck' else 'driver' end))
    into v_add, v_with
    from rt_vehicle_segments g join ct_round_trips r on r.id = g.rt_id
   where g.id is distinct from new.id and g.rt_id is distinct from new.rt_id
     and g.deleted_at is null and not g.rt_cancelled and g.trip_type = 'OWNED'
     and not (g.rt_id = any (new.overlap_rts))
     and ((new.truck_id is not null and g.truck_id = new.truck_id) or (new.driver_id is not null and g.driver_id = new.driver_id))
     and tstzrange(g.from_at, greatest(g.from_at, g.to_at), '[)') && tstzrange(new.from_at, greatest(new.from_at, new.to_at), '[)');
  if v_add is null then return new; end if;
  perform plan_h_audit(coalesce(nullif(current_setting('plan.accept_actor', true), ''), 'unknown'),
                       coalesce(nullif(current_setting('plan.accept_role', true), ''), 'unknown'),
                       'update', 'rt_vehicle_segments', new.id::text, jsonb_build_object('overlap_rts', new.overlap_rts),
                       jsonb_build_object('overlap_rts', new.overlap_rts || v_add, 'rt_id', new.rt_id, 'overlaps', v_with));
  new.overlap_rts := new.overlap_rts || v_add;
  return new;
end
$f$;
  CREATE TRIGGER plan_seg_overlap_mark BEFORE INSERT OR UPDATE ON public.rt_vehicle_segments
    FOR EACH ROW EXECUTE FUNCTION public.plan_seg_overlap_mark();

  -- the pair rule at COMMIT, on the final rows: two live OWNED segments of different trips, same truck or driver, that
  -- overlap, where one side names something (two empty sides are the EXCLUDE's) - refused unless one side names the
  -- other's trip; the same codes as plan_h_busy and the EXCLUDE (the Worker reads the plan: hint)
  CREATE FUNCTION public.plan_chk_seg_overlap() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
declare s rt_vehicle_segments%rowtype; v_code text; v_rule text;
begin
  select * into s from rt_vehicle_segments where id = new.id;
  if s.id is null or s.deleted_at is not null or s.rt_cancelled or s.trip_type is distinct from 'OWNED' then return null; end if;
  select r.code, case when s.truck_id is not null and g.truck_id = s.truck_id then 'truck_busy' else 'driver_busy' end
    into v_code, v_rule
    from rt_vehicle_segments g join ct_round_trips r on r.id = g.rt_id
   where g.id <> s.id and g.rt_id <> s.rt_id and g.deleted_at is null and not g.rt_cancelled and g.trip_type = 'OWNED'
     and (s.overlap_rts <> '{}' or g.overlap_rts <> '{}')
     and not (g.rt_id = any (s.overlap_rts) or s.rt_id = any (g.overlap_rts))
     and ((s.truck_id is not null and g.truck_id = s.truck_id) or (s.driver_id is not null and g.driver_id = s.driver_id))
     and tstzrange(g.from_at, greatest(g.from_at, g.to_at), '[)') && tstzrange(s.from_at, greatest(s.from_at, s.to_at), '[)')
   order by g.from_at, g.id limit 1;
  if v_code is null then return null; end if;
  raise exception 'plan rule broken: %:%', v_rule, v_code using errcode = '23514', hint = 'plan:' || v_rule;
end
$f$;
  CREATE CONSTRAINT TRIGGER plan_seg_overlap_verify AFTER INSERT OR UPDATE ON public.rt_vehicle_segments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk_seg_overlap();
  -- internal, as 072b's own segment functions: no role calls them directly
  REVOKE ALL ON FUNCTION public.plan_h_accept_busy(jsonb,text,text,text), public.plan_seg_overlap_mark(),
    public.plan_chk_seg_overlap() FROM PUBLIC, anon, authenticated, service_role;
  -- B-54 (the auditor's hourly trigger inventory) follows the two triggers this block adds, never red by surprise
  UPDATE monitoring.checks SET red_value = v_trg0 + 2 WHERE id = 'B-54';

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', ARRAY[b_1a], ARRAY[b_1b], 'ffbfbf45a9b3cc353862b943a1761388'),
      ('public.plan_h_target(jsonb,jsonb,text,text)', ARRAY[t_1a], ARRAY[t_1b], 'a56f5d9fe6a321aeef3db7b030ccdb6e'),
      ('public.plan_move_pieces(jsonb,text,text)', ARRAY[m_1a], ARRAY[m_1b], '2a8c746b726a9b37f0247166da0ecae5'),
      ('public.plan_rt_update(jsonb,text,text)', ARRAY[u_1a], ARRAY[u_1b], 'd8de8c443ddc601469c53a90c4e5c1fc'),
      ('public.plan_rt_problem(bigint)', ARRAY[o_1a], ARRAY[o_1b], '1b256db4b2a6ff7d0d8ed0e948a1894c'),
      ('public.plan_h_reseq(bigint,text,text)', ARRAY[r_1a, r_2a], ARRAY[r_1b, r_2b], '6f0c0daebd0963472291dd3546df93a9')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '086: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '086: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '086: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '086 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 2 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1 THEN
    RAISE EXCEPTION '086 proof: triggers % -> % (086 adds two), B-54 must follow', v_trg0, v_trg1;
  END IF;
  -- the rule at COMMIT is still there: both EXCLUDE, deferred, partial on overlap_rts = '{}' (md5 measured on PGlite),
  -- and the pair rule beside them
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_truck_once' AND contype = 'x' AND condeferrable AND condeferred) IS DISTINCT FROM '4b6dc90d32d0acea6475d94fad282a50'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_driver_once' AND contype = 'x' AND condeferrable AND condeferred) IS DISTINCT FROM 'e45254c4bf19b503f0d78e7377cf061f'
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass AND tgname = 'plan_seg_overlap_verify'
        AND tgdeferrable AND tginitdeferred AND tgenabled <> 'D') THEN
    RAISE EXCEPTION '086 proof: the partial deferred EXCLUDE or the deferred pair rule is not in place';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rt_vehicle_segments WHERE overlap_rts <> '{}') THEN
    RAISE EXCEPTION '086 proof: a segment names a trip by the migration itself';
  END IF;
  RAISE NOTICE '086 OK: an accepted overlap is allowed pair by pair with a trace (partial EXCLUDE + pair rule), a drop follows its pickup, stop_order refuses only an impossible order, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'::regprocedure) AS busy_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure) AS reseq_md5,
       (SELECT count(*) FROM public.rt_vehicle_segments WHERE overlap_rts <> '{}') AS named;
