-- 104 ROLLBACK - removes pl_week_checks and its 3 acts + 2 helpers; B-54 back by one. ASCII, ONE DO block.
-- It REFUSES while any mark exists: a mark is the accountant's record of a checked week (history), never thrown away
-- by a rollback. To roll back with marks, the owner decides first what happens to them.
-- Before it, the front end must not call /pallets/week-checks (the mark hides itself when the route answers 404 / 500,
-- and the Worker that knows the route is rolled back first: the route then answers 404).
-- EXPECTED: NOTICE '104 ROLLBACK OK: ...' and the row result = 'before 104'.
DO $do$
DECLARE v_trg0 int; v_trg1 int; v_k bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.pl_week_checks') IS NULL THEN RAISE EXCEPTION '104 rollback: 104 is not in place - nothing to do'; END IF;
  IF (SELECT count(*) FROM public.pl_week_checks) > 0 THEN
    RAISE EXCEPTION '104 rollback: % mark(s) exist - refused (history; the owner decides first)', (SELECT count(*) FROM public.pl_week_checks);
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  DROP FUNCTION public.pl_week_check(jsonb, text, text);
  DROP FUNCTION public.pl_week_uncheck(jsonb, text, text);
  DROP FUNCTION public.pl_week_check_changes(jsonb, text, text);
  DROP TABLE public.pl_week_checks;   -- its trigger, index and policy go with it
  DROP FUNCTION public.plw_h_json(jsonb);
  DROP FUNCTION public.plw_h_raise(text, text);
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 - 1 THEN RAISE EXCEPTION '104 rollback: trigger count % -> % (expected -1)', v_trg0, v_trg1; END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value::int = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '104 rollback: B-54 not updated (% rows)', v_k; END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '104 ROLLBACK OK: triggers % -> %, B-54 = %', v_trg0, v_trg1, v_trg1;
END $do$;

SELECT CASE WHEN to_regclass('public.pl_week_checks') IS NULL AND to_regprocedure('public.pl_week_check(jsonb,text,text)') IS NULL
            THEN 'before 104' ELSE '104 STILL IN PLACE' END AS result,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
