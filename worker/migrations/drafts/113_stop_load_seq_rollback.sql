-- 113 ROLLBACK - drops order_stops.load_seq and its CHECK, ONLY while every row is NULL (a position written by the
-- form is the dispatcher's work: it is never thrown away blind). The order, strictly:
--   1. revert the FRONT END that writes "Load Seq" first: with the old Worker the label is dropped with a 200
--      (facade trap 1), so a form still writing it would show success and keep nothing;
--   2. roll the Worker back (to the one without "Load Seq", guard --seq 0);
--   3. then this file.
-- If rows carry a position, this stops and says how many; copy them first, e.g.
--   SELECT id, order_id, stop_type, load_seq FROM order_stops WHERE load_seq IS NOT NULL ORDER BY order_id, id;
-- then, only with the owner's yes, set them to NULL and run this again.
-- ASCII only. ONE DO block.
-- EXPECTED: NOTICE "113 ROLLBACK OK: ..." ; then verify: result = '113 NOT in place (column absent)'.

DO $do$
DECLARE
  v_set bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'load_seq') THEN
    RAISE EXCEPTION '113 ROLLBACK: order_stops.load_seq does not exist - nothing to do';
  END IF;
  -- the lock first, then the count: no position can be committed between the count and the DROP
  LOCK TABLE public.order_stops IN ACCESS EXCLUSIVE MODE;
  SELECT count(*) INTO v_set FROM public.order_stops WHERE load_seq IS NOT NULL;
  IF v_set > 0 THEN
    RAISE EXCEPTION '113 ROLLBACK refused: % stops carry a position (load_seq) - copy them first (see the header), nothing dropped', v_set;
  END IF;
  ALTER TABLE public.order_stops DROP CONSTRAINT IF EXISTS order_stops_load_seq_pos;
  ALTER TABLE public.order_stops DROP COLUMN load_seq;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '113 ROLLBACK OK: order_stops.load_seq and order_stops_load_seq_pos dropped (0 rows had a position)';
END
$do$;
