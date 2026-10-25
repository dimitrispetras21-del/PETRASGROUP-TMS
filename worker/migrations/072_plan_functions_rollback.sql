-- 072 ROLLBACK - every function 072 created goes; nothing else exists to undo (072 adds no table, column, view,
-- trigger or grant on anything but its own functions). Only with an explicit yes, after 15:00.
-- It REFUSES as soon as one v5 row exists (spec 2.2: after the first real v5 row there is no going back, only
-- fixes forward; with the /plan/* writes closed until day L there is none before L). The Worker answers 503
-- schema_behind on /plan/* after this (Task G4): roll the Worker back FIRST if it is already deployed.
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "072 ROLLBACK OK ..." and ONE row "072 ROLLED BACK | 6 | <B-54 red_value> | <same>".

DO $do$
DECLARE
  v_f1 CONSTANT text[] := ARRAY['plan_chk', 'plan_rt_window_sync', 'plan_rt_problem', 'plan_shipment_problem',
                                'plan_leg_problem', 'plan_local_loading_problem'];
  v_f record; v_k bigint; v_n int := 0; v_trg0 int; v_trg1 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regprocedure('public.plan_board(date,text)') IS NULL THEN
    RAISE EXCEPTION '072 rollback: 072 is not applied - nothing to undo';
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices)
       + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2 OR partner_rate IS NOT NULL)
       + (SELECT count(*) FROM public.local_moves WHERE move_kind = 'nat_loading' OR rt_stop_id IS NOT NULL)
       + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL)
    -- order_stops.via_hub is NOT counted: the facade can write it from F2 on (decision 27), and it is not a v5 row
    INTO v_k;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '072 rollback: % v5 row(s) exist - after the first real v5 row there is no rollback, only fixes forward (spec 2.2)', v_k;
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- Every plan_* that is not one of 071's six: the 16 public, plan_rt_create, every plan_h_*. Read from the
  -- catalogue, not from a list, so a helper added in review cannot be left behind.
  FOR v_f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
                AND NOT (p.proname = ANY (v_f1)) ORDER BY 1 LOOP
    EXECUTE format('DROP FUNCTION %s', v_f.sig);
    v_n := v_n + 1;
  END LOOP;

  -- PROOFS
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%') <> 6
     OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY (v_f1)) <> 6 THEN
    RAISE EXCEPTION '072 rollback proof: the plan_* left are not exactly the six of 071';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_chk()'::regprocedure) <> '8f2fa7e5541aded2dffc853a57c54c22'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_sync_from_rt()'::regprocedure) <> '331cea3a8987b74a9b0add698df9b158' THEN
    RAISE EXCEPTION '072 rollback proof: a function 072 relies on changed';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR v_trg1 IS DISTINCT FROM (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') THEN
    RAISE EXCEPTION '072 rollback proof: triggers % -> %, B-54 % (072 had none)', v_trg0, v_trg1,
      (SELECT red_value FROM monitoring.checks WHERE id = 'B-54');
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '072 ROLLBACK OK: % function(s) dropped, the six of 071 remain, triggers % (B-54 unchanged)', v_n, v_trg1;
END $do$;

SELECT CASE WHEN to_regprocedure('public.plan_board(date,text)') IS NULL THEN '072 ROLLED BACK' ELSE '072 STILL IN PLACE' END AS result,
       (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%') AS plan_functions,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
