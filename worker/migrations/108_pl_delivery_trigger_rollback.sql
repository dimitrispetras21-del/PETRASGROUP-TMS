-- 108 ROLLBACK - drops the two triggers and the three functions, B-54 back by 2. ASCII only, ONE DO block.
-- Rows the triggers wrote stay (they are confirmed deliveries with their audit rows; a wrong one is reversed in the
-- pallets page, never deleted). Before it, revert the front-end PR that stopped the browser's own write, or no one
-- writes the delivery.
DO $do$
DECLARE v_trg0 int; v_trg1 int; v_k int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);
  IF to_regprocedure('public.pl_h_delivery_write(bigint,bigint,text)') IS NULL THEN
    RAISE EXCEPTION '108 rollback: nothing to drop (108 not in place)';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  DROP TRIGGER IF EXISTS pl_delivery_from_order ON public.orders;
  DROP TRIGGER IF EXISTS pl_delivery_from_stop ON public.order_stops;
  DROP FUNCTION IF EXISTS public.pl_h_delivery_from_order();
  DROP FUNCTION IF EXISTS public.pl_h_delivery_from_stop();
  DROP FUNCTION IF EXISTS public.pl_h_delivery_write(bigint, bigint, text);
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value::int = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '108 rollback: B-54 not updated (% rows)', v_k; END IF;
  RAISE NOTICE '108 ROLLED BACK: triggers % -> %, B-54 = % (% deliveries written by it stay)', v_trg0, v_trg1, v_trg1,
    (SELECT count(*) FROM public.audit_log WHERE actor = 'system' AND after_data ->> 'source' = 'trigger:108');
END
$do$;
