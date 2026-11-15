-- 113 DRY RUN - the whole of 113_stop_load_seq.sql, then proofs on the real rows, then a deliberate error:
-- NOTHING is kept. Run it first; read the error text (it is the result), then run 113_stop_load_seq.sql.
-- Extra proofs here only: every live international loading / delivery stop gets a position and no other table (public
-- or monitoring) gets a row written by this transaction (no trigger woke and wrote), a 0 is refused by the CHECK, and
-- back to NULL. Each other table is counted once, without sorting.
-- EXPECTED: ERROR "DRY RUN 113 finished: ..." with "0 rows written in the other N tables" and "refused 0: yes".
-- ASCII only.

DO $do$
DECLARE
  v_trg0 int; v_trg1 int; v_any text; v_rows bigint; v_set bigint;
  v_t text; v_n bigint; v_xid text; v_tables int := 0; v_after text := ''; v_upd bigint; v_refused boolean := false;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);
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
  SELECT count(*) INTO v_trg0 FROM pg_trigger WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal;
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

  -- ===== PART 2: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal;
  IF v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '113: triggers on order_stops % -> % - nothing kept', v_trg0, v_trg1;
  END IF;
  SELECT count(*), count(load_seq) INTO v_rows, v_set FROM public.order_stops;
  IF v_set <> 0 THEN
    RAISE EXCEPTION '113: % rows have a load_seq right after the ALTER - nothing kept', v_set;
  END IF;
  -- PostgREST (the Worker's door) learns the new column at commit, not at its next restart
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '113 OK: order_stops.load_seq added, % rows all NULL; triggers % (unchanged), on any UPDATE: %; % ms',
    v_rows, v_trg1, coalesce(v_any, 'none'), round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);

  -- ===== DRY RUN ONLY: the column is quiet =====
  -- every live international loading / delivery stop gets a position (its stop_number, or 1): the busiest possible
  -- write of the new column. Then EVERY other table (public and monitoring) is asked how many rows THIS transaction
  -- wrote there (xmin = this transaction): a trigger that inserted or rewrote a row would show here. Other sessions'
  -- writes during the run cannot raise a false alarm (they carry another xmin), and no table is read twice or sorted.
  UPDATE public.order_stops SET load_seq = greatest(coalesce(stop_number, 1), 1)
   WHERE deleted_at IS NULL AND order_id IS NOT NULL AND stop_type IN ('Loading', 'Unloading');
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  v_xid := (txid_current() % 4294967296)::text;
  FOR v_t IN SELECT format('%I.%I', n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'monitoring') AND c.oid <> 'public.order_stops'::regclass
              ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM %s t WHERE t.xmin::text = %L', v_t, v_xid) INTO v_n;
    v_tables := v_tables + 1;
    IF v_n > 0 THEN v_after := v_after || v_t || '=' || v_n || ' '; END IF;
  END LOOP;
  IF v_after <> '' THEN
    RAISE EXCEPTION '113 DRY RUN FAILED: writing load_seq on % stops wrote rows elsewhere: %', v_upd, v_after;
  END IF;
  BEGIN
    UPDATE public.order_stops SET load_seq = 0 WHERE id = (SELECT min(id) FROM public.order_stops);
  EXCEPTION WHEN check_violation THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION '113 DRY RUN FAILED: a position 0 was accepted';
  END IF;
  UPDATE public.order_stops SET load_seq = NULL WHERE load_seq IS NOT NULL;
  RAISE EXCEPTION 'DRY RUN 113 finished: % rows, % live stops given a position, 0 rows written in the other % tables; refused 0: yes; triggers % (unchanged), on any UPDATE: %; % ms - nothing kept (deliberate error)',
    v_rows, v_upd, v_tables, v_trg1, coalesce(v_any, 'none'), round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$do$;
