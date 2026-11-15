-- 113 - THE ORDER OF POINTS IN A GROUPAGE, PER POINT (owner 15/11/2026: the groupage is entered from the new
-- international order form, with a side panel that drags the loading order and the delivery order; decided "ana
-- simeio", per point, not per order: docs/design/redesign-2026-11/groupage-from-the-form.md, decision 2).
-- The owner runs it in the Supabase SQL editor AFTER 15:00, with an explicit yes, one step at a time:
--   1. 113_stop_load_seq_dryrun.sql   this block + the proofs, then a deliberate error: NOTHING kept
--   2. 113_stop_load_seq.sql          (this file)
--   3. 113_stop_load_seq_verify.sql   read-only, one row
-- THEN the Worker (label "Load Seq" in ORDER STOPS, guard --seq 1), THEN the front end that writes it. Never the
-- Worker first: a write naming the label would meet no column (422 113_missing) and a read asking for it by fields[]
-- would fail.
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT CHANGES
--   order_stops.load_seq: integer, NULL allowed, CHECK order_stops_load_seq_pos (see below). It is the point's
--   position inside its LOAD (every order that shares one Group ID base, the text before '|'), counted apart among
--   the load's loading points and among its delivery points (one column serves both lists: a point is a Loading or
--   an Unloading; a cross-dock stop (069) is in neither list and readers skip it). The CHECK allows a position only
--   on a stop of an international order (order_id set): a national stop has no place in a load. NULL = today's rule, unchanged: the order list in Group ID, then Stop Number, then the date. Nothing is
--   back-filled: today 1862 rows (1535 not deleted, counted 15/11 by SELECT), every one NULL after it, so every
--   screen of today (Weekly, driver sheet, Daily Ops, pallets) reads exactly what it reads now.
--   No trigger, function, view or grant changes. The triggers on order_stops today fire on INSERT or on an UPDATE OF
--   named columns that do not include load_seq; the dry run lists them all and says which, if any, wakes on an UPDATE
--   of any column.
-- RUNTIME: one ALTER TABLE ADD COLUMN (nullable, no default: catalogue only, no rewrite) and one ADD CONSTRAINT (one
-- scan of ~1.9k rows), a short lock on order_stops, lock_timeout 5s (statement_timeout is set for the statements
-- inside the block only; the block itself is bounded by its few statements).
-- REVERSE: 113_stop_load_seq_rollback.sql (drops the column and its CHECK, only while every row is NULL).
-- EXPECTED: NOTICE "113 OK: ..." ; then verify: result = '113 in place'.

DO $do$
DECLARE
  v_trg0 int; v_trg1 int; v_any text; v_rows bigint; v_set bigint;
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
END
$do$;
