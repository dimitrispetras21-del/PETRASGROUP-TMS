-- 113 DRY RUN - the whole of 113_stop_load_seq.sql, then proofs on the real rows, then a deliberate error:
-- NOTHING is kept. Run it first; read the error text (it is the result), then run 113_stop_load_seq.sql.
-- Extra proofs here only: every live international loading / delivery stop gets a position, and this transaction's
-- own counters (pg_stat_xact_user_tables: rows inserted / updated / deleted, subtransactions included) say no other
-- table was touched - no trigger woke and wrote or removed. No table is read for it, so the lock on order_stops lasts
-- milliseconds. Then a 0 is refused by the CHECK.
-- EXPECTED: ERROR "DRY RUN 113 finished: ..." with "no other table touched" and "refused 0: yes".
-- ASCII only.

DO $do$
DECLARE
  v_trg int; v_any text; v_rows bigint;
  v_upd bigint; v_touched text; v_os text; v_s0 jsonb; v_refused boolean := false;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF to_regclass('public.order_stops') IS NULL THEN
    RAISE EXCEPTION '113: public.order_stops does not exist - wrong database?';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'load_seq') THEN
    RAISE EXCEPTION '113: order_stops.load_seq already exists - 113 has run, nothing to do';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname = 'order_stops_load_seq_pos') THEN
    RAISE EXCEPTION '113: the CHECK order_stops_load_seq_pos exists without its column - stop, look before running';
  END IF;
  -- the Worker that maps "Load Seq" is built on the one that maps 111's hours: 111 must be in place
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name IN ('time_from', 'time_to')) <> 2 THEN
    RAISE EXCEPTION '113: 111 is not in place (order_stops.time_from / time_to missing) - run 111 first';
  END IF;
  SELECT count(*) INTO v_trg FROM pg_trigger WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal;
  -- a trigger with UPDATE (tgtype bit 16) and no column list (tgattr empty) fires on an UPDATE of ANY column,
  -- load_seq included: named here, never assumed away
  SELECT string_agg(tgname, ', ' ORDER BY tgname) INTO v_any FROM pg_trigger
   WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal AND (tgtype & 16) <> 0 AND cardinality(tgattr::int2[]) = 0;

  -- ===== PART 1: THE COLUMN =====
  ALTER TABLE public.order_stops ADD COLUMN load_seq integer NULL;
  -- only on a stop of an INTERNATIONAL order (order_id): a national stop has no place in a load. The stop type is
  -- NOT in the CHECK on purpose (code review 15/11): a position there would refuse a later change of the stop's type
  -- with a message about positions the dispatcher never touched; readers count only Loading / Unloading points, and
  -- the form rewrites every position of the load on each save
  ALTER TABLE public.order_stops ADD CONSTRAINT order_stops_load_seq_pos CHECK (
    load_seq IS NULL OR (load_seq > 0 AND order_id IS NOT NULL));
  COMMENT ON COLUMN public.order_stops.load_seq IS
    '113 (owner 15/11/2026): position of this point inside its load (Group ID base), counted apart among loading and among delivery points; NULL = the old rule (Group ID order list, then stop_number, then date)';

  -- ===== PART 2: REPORT =====
  SELECT count(*) INTO v_rows FROM public.order_stops;
  -- PostgREST (the Worker's door) learns the new column at commit, not at its next restart
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '113 OK: order_stops.load_seq added, % rows all NULL; triggers on order_stops %, on any UPDATE: %; % ms',
    v_rows, v_trg, coalesce(v_any, 'none'), round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);

  -- ===== DRY RUN ONLY: the column is quiet =====
  -- every live international loading / delivery stop gets a position (its stop_number, or 1): the busiest write of the
  -- new column. The session's own row counters (pg_stat_xact_user_tables) are read just before and just after it and
  -- compared: they cannot be flushed in the middle of this one statement, so the difference is exactly what this
  -- UPDATE and every trigger it woke did. order_stops must differ by these updates only, every other table not at all.
  SELECT coalesce(jsonb_object_agg(relid::regclass::text, jsonb_build_array(n_tup_ins, n_tup_upd, n_tup_del)), '{}'::jsonb)
    INTO v_s0 FROM pg_stat_xact_user_tables;
  UPDATE public.order_stops SET load_seq = greatest(coalesce(stop_number, 1), 1)
   WHERE deleted_at IS NULL AND order_id IS NOT NULL AND stop_type IN ('Loading', 'Unloading');
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  WITH d AS (
    SELECT relid::regclass::text AS rel,
           n_tup_ins - coalesce((v_s0 -> relid::regclass::text ->> 0)::bigint, 0) AS ins,
           n_tup_upd - coalesce((v_s0 -> relid::regclass::text ->> 1)::bigint, 0) AS upd,
           n_tup_del - coalesce((v_s0 -> relid::regclass::text ->> 2)::bigint, 0) AS del
      FROM pg_stat_xact_user_tables)
  SELECT string_agg(format('%s ins=%s upd=%s del=%s', rel, ins, upd, del), ', ' ORDER BY rel) FILTER (WHERE rel <> 'order_stops' AND rel <> 'public.order_stops' AND ins + upd + del <> 0),
         max(format('ins=%s upd=%s del=%s', ins, upd, del)) FILTER (WHERE rel IN ('order_stops', 'public.order_stops'))
    INTO v_touched, v_os FROM d;
  IF v_touched IS NOT NULL THEN
    RAISE EXCEPTION '113 DRY RUN FAILED: writing load_seq on % stops touched other tables: %', v_upd, v_touched;
  END IF;
  IF v_upd > 0 AND v_os IS DISTINCT FROM format('ins=0 upd=%s del=0', v_upd) THEN
    RAISE EXCEPTION '113 DRY RUN FAILED: order_stops % for % position writes', coalesce(v_os, 'not counted'), v_upd;
  END IF;
  BEGIN
    UPDATE public.order_stops SET load_seq = 0 WHERE id = (SELECT min(id) FROM public.order_stops WHERE order_id IS NOT NULL);
  EXCEPTION WHEN check_violation THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION '113 DRY RUN FAILED: a position 0 was accepted';
  END IF;
  RAISE EXCEPTION 'DRY RUN 113 finished: % rows, % live stops given a position, no other table touched; refused 0: yes; triggers on order_stops %, on any UPDATE: %; % ms - nothing kept (deliberate error)',
    v_rows, v_upd, v_trg, coalesce(v_any, 'none'), round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$do$;
