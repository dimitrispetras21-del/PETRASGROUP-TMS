-- 083 - NATIONAL v5: A LOAD WITHOUT A TRUCK YET ("fortio chwris fortigo", owner 31/10).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
-- The owner (31/10): "the orders go into the LOAD, not into the truck; the user opens a new load with a + and chooses
--   which orders go in it - a second, a third, as many as he wants". A truck (own or partner) is given to a load LATER,
--   with the same assignment form, and the whole load goes on it. On the board a load without a truck is a
--   "PROS ANATHESI" row of its day, with its contents and x/33.
-- WHY THIS SHAPE (no new table): a v5 cycle without a vehicle is ALREADY a state of the base - 013 relaxed
--   owned_needs_truck for open cycles, plan_rt_clear (072, decision 12) leaves exactly that (OWNED, truck / trailer /
--   driver / partner NULL), 072b's first segment is born from the cycle as it is (no CHECK needs a truck on an OWNED
--   segment), v_rt_stop_state.has_vehicle = false paints it "PROS ANATHESI", and PATCH /plan/rt (plan_rt_update) gives
--   it a vehicle later. Only the BIRTH refused it: plan_rt_create raised no_vehicle. A second entity (a "load" table)
--   would be a second source of truth for what a cycle already is (principle 3).
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 082 applied (the last v5 migration that ran before this one), 083 not applied, the LIVE text of
--           plan_rt_create (md5 of prosrc = production: 072 as 072b proved it, untouched by 073-082), day L set,
--           B-54 = the enabled triggers
--   PART 1  plan_rt_create = live text + 3 hunks: new_rt may say {"trip_type": "OWNED", "later": true} and carry no
--           vehicle at all; then the cycle is born with none (the state plan_rt_clear leaves). "later" is opt-in and
--           strict: a request that merely forgot its truck is still refused no_vehicle (principle 1); "later" with any
--           vehicle key, a partner or a rate is bad_input; "later" that is not a JSON boolean is bad_input. The busy
--           checks need a vehicle and are skipped (nothing to clash).
--   PART 3  proofs, NOTICE "083 OK: ..."
-- No table, no column, no trigger, no grant, no row written. No Worker change: /plan/legs passes the body to the
-- function as it is (index.js, the plan routes), and its texts already cover bad_input / no_vehicle.
-- 081 (draft, PR #182) patches other functions; any order between 081 and 083 is fine.
-- RUN: 083_plan_load_without_truck_dryrun.sql, then this file, then 083_plan_load_without_truck_verify.sql.
-- REVERSE: 083_plan_load_without_truck_rollback.sql (cycles born without a vehicle STAY - they are what the desk made;
-- a vehicle is given to them with PATCH /plan/rt as to any cleared cycle).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  u_1a CONSTANT text := $h$  v_type text; v_truck bigint; v_trailer bigint; v_driver bigint; v_partner bigint; v_rate numeric;
$h$;
  u_1b CONSTANT text := $h$  v_type text; v_truck bigint; v_trailer bigint; v_driver bigint; v_partner bigint; v_rate numeric;
  v_later boolean;  -- 083: a load born without a vehicle (owner 31/10)
$h$;
  u_2a CONSTANT text := $h$  perform plan_h_keys(nr, array['trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'partner_rate'], 'new_rt');
$h$;
  u_2b CONSTANT text := $h$  perform plan_h_keys(nr, array['trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'partner_rate', 'later'], 'new_rt');
$h$;
  u_3a CONSTANT text := $h$  if v_type = 'OWNED' then
$h$;
  u_3b CONSTANT text := $h$  -- 083 (owner 31/10): "later" = the load is made now, its vehicle is given later (PATCH /plan/rt). Opt-in and
  -- strict: without it a missing truck is still no_vehicle; with it, no vehicle key, partner or rate at all.
  if nr ? 'later' then
    if jsonb_typeof(nr->'later') is distinct from 'boolean' then perform plan_h_raise('bad_input', 'new_rt.later'); end if;
    v_later := (nr->>'later')::boolean;
  end if;
  if coalesce(v_later, false) then
    if v_type is distinct from 'OWNED' or v_truck is not null or v_trailer is not null or v_driver is not null
       or v_partner is not null or v_rate is not null then
      perform plan_h_raise('bad_input', 'new_rt.later: no vehicle, partner or rate');
    end if;
  elsif v_type = 'OWNED' then
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.rt_sync_from_order()')) IS DISTINCT FROM '1a1c357803bc1c0c7368e1ba5b1335cc' THEN
    RAISE EXCEPTION '083: 082 is not applied (order 082 -> 083) - stop';
  END IF;
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '083: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_create(jsonb,text,text)', '37c04d5803944fdeaf9d0534a0b83506')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '083: % is not its live text of 31/10 (083 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '083: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_create(jsonb,text,text)', ARRAY[u_1a, u_2a, u_3a], ARRAY[u_1b, u_2b, u_3b], '7e6abee9852b952a1de922d0dbc794bf')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '083: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '083: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '083: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '083 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '083 proof: triggers % -> % (083 adds none)', v_trg0, v_trg1; END IF;
  -- a request that forgot its truck is still refused (the opt-in is the only way in)
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_rt_create(jsonb,text,text)'::regprocedure) NOT LIKE '%no_vehicle%' THEN
    RAISE EXCEPTION '083 proof: plan_rt_create no longer refuses a missing truck';
  END IF;
  RAISE NOTICE '083 OK: plan_rt_create accepts new_rt.later (a load without a vehicle), triggers %', v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_create(jsonb,text,text)'::regprocedure) AS rt_create_md5;
