-- 086 - NATIONAL v5: A BUSY TRUCK / DRIVER IS ALLOWED WHEN THE SAVE ACCEPTS IT; AN ALL-DAY DROP FOLLOWS ITS PICKUP
-- (owner 1/11, "ok" to P-5 of PR #184: relaxed rules - allowed with a trace and a warning; only data integrity refuses).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
-- NEEDS 084 APPLIED (#188): plan_h_busy is patched on the text 084 writes (md5 285ca0f0...). Order: 084 -> 086.
-- Independent of 083 (#186): 083 patches plan_rt_create only, 086 does not touch it.
--
-- 1. BUSY. Today a truck or a driver on two trips at once is refused twice: early by plan_h_busy (it names the other
--    trip) and at COMMIT by the deferred EXCLUDE rt_v2_truck_once / rt_v2_driver_once (072b, on rt_vehicle_segments).
--    The planner's windows are approximate (a load of the next trip with its own loading at 09:00, the trip before it
--    ending at 14:00), and the owner allows the overlap when the person saving says so. The RULE STAYS IN THE BASE
--    (principle 4): the two EXCLUDE are rebuilt with the same names as PARTIAL ones, WHERE NOT overlap_ok. A segment
--    gets overlap_ok = true only inside a save that carried accept_busy: true (the screen's second press, "save
--    anyway", after the first answer was truck_busy / driver_busy), and only if it really overlaps another trip's
--    segment then. Every such mark writes an audit_log row: who, which segment, which trips it overlaps.
--      - the flag never goes back to false by itself: an accepted overlap stays accepted when the times move later
--        (a marked segment is no longer seen by the two EXCLUDE; the early check plan_h_busy still asks again on every
--        new trip and every change of this trip, it reads every segment, marked or not);
--      - a save without accept_busy is refused exactly as today (same codes, same texts in the Worker);
--      - two segments of the SAME trip are never marked (072b's rule inside a trip stays).
-- 2. STOP ORDER. 081's road order sorts a trip's stops by planned_from first. An all-day drop at a client (00:00-23:59)
--    on the day of its own Veroia loading (16:00-18:00) sorted BEFORE that loading, and 071 refused it (leg_order).
--    plan_h_reseq now moves a drop to right after the last of its own pickups (leg_order: a piece is never delivered
--    before it is loaded - that stays a refusal, it is integrity). Then the drop's 00:00 is earlier than the loading's
--    16:00 ahead of it, which 071 stop_order refused: stop_order now refuses only a stop that ENDS before the stop ahead
--    of it STARTS (an order no truck can drive); overlapping windows are a plan, not an error.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 084 applied (plan_h_busy = 084's text), the LIVE texts of plan_h_target, plan_rt_update,
--           plan_rt_problem and plan_h_reseq (081), the two EXCLUDE as 072b made them, no overlap_ok column yet, day L,
--           B-54 = the enabled triggers
--   PART 1  schema: rt_vehicle_segments.overlap_ok (NOT NULL DEFAULT false: every row false, no row rewritten);
--           the two EXCLUDE rebuilt partial, same names, same columns, DEFERRABLE INITIALLY DEFERRED;
--           plan_h_accept_busy (reads accept_busy, sets three transaction-local settings);
--           plan_seg_overlap_ok + its BEFORE trigger (the mark and the audit row); B-54 = measured + 1
--   PART 2  live text + hunks: plan_h_busy (an accepted overlap is not refused), plan_h_target and plan_rt_update
--           (accept_busy is a known key, read by plan_h_accept_busy), plan_rt_problem (stop_order), plan_h_reseq (a drop
--           after its pickup)
--   PART 3  proofs, NOTICE "086 OK: ..."
-- No row is written by this file (the new column is false everywhere). No Worker change: the Worker passes the body as
-- it is and already answers truck_busy / driver_busy for both layers.
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
  -- here; plan_seg_overlap_ok marks the segments it writes and leaves the audit row, the EXCLUDE skips only those
  if current_setting('plan.accept_busy', true) = '1' then return; end if;
$h$;
  t_1a CONSTANT text := $h$  perform plan_h_keys(p_target, array['rt_id', 'side', 'new_rt'], 'target');
$h$;
  t_1b CONSTANT text := $h$  perform plan_h_keys(p_target, array['rt_id', 'side', 'new_rt', 'accept_busy'], 'target');
  -- 086: target.accept_busy = true lets this save overlap another trip of the same truck / driver, with a trace
  perform plan_h_accept_busy(p_target, 'target', p_actor, p_role);
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
      ('public.plan_rt_update(jsonb,text,text)', 'be70612fb940356278c7c66705c8ee33'),
      ('public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'),
      ('public.plan_h_reseq(bigint,text,text)', 'f246c362c3f3bb1746a1d536ad1338bb')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '086: % is not its live text of 1/11 (086 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_ok')
     OR to_regprocedure('public.plan_h_accept_busy(jsonb,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.plan_seg_overlap_ok()') IS NOT NULL THEN
    RAISE EXCEPTION '086: overlap_ok / plan_h_accept_busy / plan_seg_overlap_ok already exist (086 already applied?) - stop';
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
  -- a constant default: no table rewrite, every existing segment false (= checked by both EXCLUDE, as today)
  ALTER TABLE public.rt_vehicle_segments ADD COLUMN overlap_ok boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.rt_vehicle_segments.overlap_ok IS
    '086 (owner 1/11): true = this segment overlaps another trip of the same truck or driver and the person saving accepted it (accept_busy, audit_log row by plan_seg_overlap_ok). The two EXCLUDE skip it. Never set back to false by the base.';
  -- the same two rules, same names, same columns and range; a marked segment is left out of both
  ALTER TABLE public.rt_vehicle_segments DROP CONSTRAINT rt_v2_truck_once, DROP CONSTRAINT rt_v2_driver_once,
    ADD CONSTRAINT rt_v2_truck_once EXCLUDE USING gist (truck_id WITH =, tstzrange(from_at, greatest(from_at, to_at), '[)') WITH &&)
      WHERE (trip_type = 'OWNED' AND truck_id IS NOT NULL AND deleted_at IS NULL AND NOT rt_cancelled AND NOT overlap_ok)
      DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT rt_v2_driver_once EXCLUDE USING gist (driver_id WITH =, tstzrange(from_at, greatest(from_at, to_at), '[)') WITH &&)
      WHERE (trip_type = 'OWNED' AND driver_id IS NOT NULL AND deleted_at IS NULL AND NOT rt_cancelled AND NOT overlap_ok)
      DEFERRABLE INITIALLY DEFERRED;

  -- accept_busy of a target or of plan_rt_update's body: a boolean or nothing (an unknown value is refused, never read
  -- as false). true = three transaction-local settings, read by plan_h_busy (no early refusal) and by the trigger below.
  CREATE FUNCTION public.plan_h_accept_busy(p jsonb, p_what text, p_actor text, p_role text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  if p is null or not p ? 'accept_busy' then return; end if;
  if jsonb_typeof(p->'accept_busy') <> 'boolean' then perform plan_h_raise('bad_input', p_what || '.accept_busy'); end if;
  if (p->>'accept_busy')::boolean then
    perform set_config('plan.accept_busy', '1', true);
    perform set_config('plan.accept_actor', coalesce(p_actor, ''), true);
    perform set_config('plan.accept_role', coalesce(p_role, ''), true);
  end if;
end
$f$;

  -- the mark: inside an accepting save only, on a live OWNED segment that overlaps a live OWNED segment of ANOTHER trip
  -- of the same truck or driver which the EXCLUDE still sees (unmarked); one audit_log row per mark, naming those trips
  CREATE FUNCTION public.plan_seg_overlap_ok() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
declare v_with jsonb;
begin
  if new.overlap_ok or coalesce(current_setting('plan.accept_busy', true), '') <> '1'
     or new.deleted_at is not null or new.rt_cancelled or new.trip_type is distinct from 'OWNED' then
    return new;
  end if;
  select jsonb_agg(distinct jsonb_build_object('rt_code', r.code, 'by', case when g.truck_id = new.truck_id then 'truck' else 'driver' end))
    into v_with
    from rt_vehicle_segments g join ct_round_trips r on r.id = g.rt_id
   where g.id is distinct from new.id and g.rt_id is distinct from new.rt_id
     and g.deleted_at is null and not g.rt_cancelled and g.trip_type = 'OWNED' and not g.overlap_ok
     and ((new.truck_id is not null and g.truck_id = new.truck_id) or (new.driver_id is not null and g.driver_id = new.driver_id))
     and tstzrange(g.from_at, greatest(g.from_at, g.to_at), '[)') && tstzrange(new.from_at, greatest(new.from_at, new.to_at), '[)');
  if v_with is null then return new; end if;
  new.overlap_ok := true;
  perform plan_h_audit(coalesce(nullif(current_setting('plan.accept_actor', true), ''), 'unknown'),
                       coalesce(nullif(current_setting('plan.accept_role', true), ''), 'unknown'),
                       'update', 'rt_vehicle_segments', new.id::text, jsonb_build_object('overlap_ok', false),
                       jsonb_build_object('overlap_ok', true, 'rt_id', new.rt_id, 'overlaps', v_with));
  return new;
end
$f$;
  CREATE TRIGGER plan_seg_overlap_ok BEFORE INSERT OR UPDATE ON public.rt_vehicle_segments
    FOR EACH ROW EXECUTE FUNCTION public.plan_seg_overlap_ok();
  -- internal, as 072b's own segment functions: no role calls them directly
  REVOKE ALL ON FUNCTION public.plan_h_accept_busy(jsonb,text,text,text), public.plan_seg_overlap_ok()
    FROM PUBLIC, anon, authenticated, service_role;
  -- B-54 (the auditor's hourly trigger inventory) follows the one trigger this block adds, never red by surprise
  UPDATE monitoring.checks SET red_value = v_trg0 + 1 WHERE id = 'B-54';

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', ARRAY[b_1a], ARRAY[b_1b], 'ddc1f26f185e7a8e2a7524471a169180'),
      ('public.plan_h_target(jsonb,jsonb,text,text)', ARRAY[t_1a], ARRAY[t_1b], 'a56f5d9fe6a321aeef3db7b030ccdb6e'),
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
  IF v_trg1 <> v_trg0 + 1 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1 THEN
    RAISE EXCEPTION '086 proof: triggers % -> % (086 adds one), B-54 must follow', v_trg0, v_trg1;
  END IF;
  -- the rule at COMMIT is still there: both EXCLUDE, deferred, partial on NOT overlap_ok (md5 measured on PGlite)
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_truck_once' AND contype = 'x' AND condeferrable AND condeferred) IS DISTINCT FROM '140cd0ded05accd213a0e619be63e953'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'rt_v2_driver_once' AND contype = 'x' AND condeferrable AND condeferred) IS DISTINCT FROM 'efd66085a4dcf26fa68f51c176b36f06' THEN
    RAISE EXCEPTION '086 proof: the partial deferred EXCLUDE rt_v2_truck_once / rt_v2_driver_once is not in place';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rt_vehicle_segments WHERE overlap_ok) THEN
    RAISE EXCEPTION '086 proof: a segment is marked overlap_ok by the migration itself';
  END IF;
  RAISE NOTICE '086 OK: an accepted overlap is allowed with a trace (partial EXCLUDE on NOT overlap_ok), a drop follows its pickup, stop_order refuses only an impossible order, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'::regprocedure) AS busy_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure) AS reseq_md5,
       (SELECT count(*) FROM public.rt_vehicle_segments WHERE overlap_ok) AS marked;
