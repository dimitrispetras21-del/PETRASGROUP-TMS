-- 107 ROLLBACK - drops pl_no_exchange, pln_h_raise and pl_v_missing_delivery. ASCII only, ONE DO block.
-- Writes made through the act stay: an order switched to "no exchange" keeps pallet_exchange = false and its
-- audit_log rows (undo one by hand in the order, never in bulk). Before it, the Worker that calls
-- /pallets/missing and /pallets/no-exchange is rolled back first (those routes would answer 500 without them).
DO $do$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);
  IF to_regclass('public.pl_v_missing_delivery') IS NULL AND to_regprocedure('public.pl_no_exchange(jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION '107 rollback: nothing to drop (107 not in place)';
  END IF;
  DROP FUNCTION IF EXISTS public.pl_no_exchange(jsonb, text, text);
  DROP FUNCTION IF EXISTS public.pln_h_raise(text, text);
  DROP VIEW IF EXISTS public.pl_v_missing_delivery;
  RAISE NOTICE '107 ROLLED BACK: view and functions dropped (% orders kept their no-exchange switch)',
    (SELECT count(*) FROM public.audit_log WHERE table_name = 'orders' AND after_data ->> 'source' = 'pallets/no-exchange');
END
$do$;
