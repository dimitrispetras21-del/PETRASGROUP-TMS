-- 065 - TEMPERATURE "AS ON THE CMR": an international order may say that its temperature is the
--       one written on the CMR instead of a number. orders.temp_per_cmr (boolean NOT NULL DEFAULT
--       false), appended to orders_with_derived, the facade's ORDERS readView (label "Temp Per CMR"),
--       and copied from a parent order to its split legs by 020's order_parent_to_legs, exactly like
--       temperature_c.
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation.
-- RELEASE ORDER (binding): this block -> Worker (branch deploy/worker-temp-cmr: the ORDERS label
-- "Temp Per CMR" -> temp_per_cmr, nothing else) -> screens.
--   This block first: alone it changes nothing anyone sees (every order reads false; no Worker
--   label and no screen names the column yet).
--   The Worker before this block fails LOUDLY but stops work: a save naming the label -> 500
--   (column does not exist), a read asking for it by name (fields[]) -> 500 for the whole page.
--   The screens before the Worker fail SILENTLY: the facade drops an unknown label and answers 200
--   (CLAUDE.md, facade trap 1) - so the order form reads "Temp Per CMR" back from the save response
--   and says so loudly when it did not stick.
--
-- Why (dispatcher Pantelis 7/10/2026: "the temperature option - whatever the CMR says"; owner 7/10:
-- "let us do both"): on many loads the shipper writes the set point on the CMR. Today the form wants a
-- number, so the dispatcher types one he does not know or leaves it empty, and the driver's paper
-- shows a guess or nothing. The flag states the truth: the number is on the CMR. When it is true,
-- Temperature C may stay empty and screens / driver messages read "as on the CMR" (their part; this
-- block only stores the fact).
-- Why a boolean and not a sentinel in temperature_c (e.g. -999) or a word in Notes: temperature_c is
-- read as a number by Weekly, Daily, print and the auditor - a sentinel would print as a temperature
-- somewhere (principles 1 and 3). Why NOT NULL: the facade drops NULL columns from a record (trap 2),
-- so a nullable flag would read "absent" on every old order and a screen could not tell "not CMR"
-- from "the column is not there"; NOT NULL makes every order carry an explicit true/false. The
-- constant default makes ADD COLUMN a catalog-only change (no table rewrite).
-- No CHECK tying the flag to temperature_c: the number stays optional exactly as today (an order may
-- carry both - the CMR rules, the number is a hint), and a refused save at 06:00 stops work.
--
-- What it changes (nothing else):
--   1. orders.temp_per_cmr boolean NOT NULL DEFAULT false, with a column comment.
--   2. orders_with_derived: CREATE OR REPLACE from its LIVE text (md5-guarded: the text 057 left on
--      5/10) plus ONE appended column "o.temp_per_cmr" - generated from the live text, not retyped, so
--      the 137 columns cannot drift; proven after: the new text = the old text + that line, character
--      for character. CREATE OR REPLACE keeps owner and grants; it would reset view options, so the
--      block refuses if the view has any (057 left none: owner-rights, reloptions NULL).
--   3. THE LEG SYNC OF 020 (coordinator 7/10, principle 4: the rule lives in the DB, not in each
--      screen). A split leg has its own driver, Daily/Weekly row and WhatsApp; 020 copies the
--      parent's temperature_c to every live leg, so without this a parent marked "CMR" with its number
--      cleared would leave every leg with no number AND no flag - the leg's driver paper would show
--      nothing. Two edits, both generated from the LIVE text (md5-guarded: what 020 left, read on
--      production 4/10), not retyped:
--      a. function order_parent_to_legs: CREATE OR REPLACE from pg_get_functiondef plus
--         "temp_per_cmr = new.temp_per_cmr" next to "temperature_c = new.temperature_c" in the
--         commercial-facts UPDATE and "temp_per_cmr is distinct from new.temp_per_cmr" next to the
--         temperature_c test in its WHERE (only real changes are written, the 013/020 loop rule).
--         Nothing else in the function moves (proven: new text = old text + those two pieces). CREATE
--         OR REPLACE keeps the function's oid, owner and grants; SECURITY DEFINER, search_path and
--         every other attribute come from the live header that pg_get_functiondef prints (proven equal).
--      b. trigger order_parent_to_legs: dropped and created again with the SAME name from
--         pg_get_triggerdef plus "temp_per_cmr" right after temperature_c in its UPDATE OF list - so a
--         change of the flag alone fires it. Same table, timing, WHEN and function (proven: new text =
--         old text + that one name). Still ONE trigger: the count stays 35 (asserted).
--      Leg rows created at split time already take the flag from the form (branch
--      feat/temp-per-cmr-front); order_leg_inherit (BEFORE INSERT of a leg) copies only client and
--      direction, as for temperature_c - not changed here.
-- NOT touched: national_orders (international orders only); the copies the screens write into
-- NATIONAL LOADS (Veroia Switch), GROUPAGE LINES and CONSOLIDATED LOADS - those tables have no flag
-- column; out of scope of 065 (a later step, owner decides); order_legs_to_parent (legs never send
-- the temperature up, so not the flag either); every other trigger, function and grant. B-54 counts
-- enabled non-internal triggers in public: a column adds none and re-creating order_parent_to_legs
-- under its own name keeps one: asserted 35 before and after (057 + 060 + 063 live since 6/10),
-- B-54 = 35, not written.
--
-- BEFORE IT: 065_temp_per_cmr_verify.sql V0 (the coordinator, SELECT only: the view md5 below, on
--   production), then 065_temp_per_cmr_dryrun.sql - this same block, generated from this file, undone.
-- EXPECTED (green, no red panel): NOTICE "065 OK: orders.temp_per_cmr in place (<n> orders, 0 marked);
--   orders_with_derived 137 -> 138 columns, same owner/grants/options; order_parent_to_legs copies
--   the flag to split legs (same owner/grants/SECURITY DEFINER/search_path), its trigger watches it;
--   triggers 35 -> 35, B-54 = 35"
--   and ONE result row "065 OK | 35 | 35 | 138 | 0 | true".
--   A red error = nothing changed (one DO block): stop, copy the panel to the coordinator.
-- AFTER IT: 065_temp_per_cmr_verify.sql V1 (one row, every column true).
-- Reverse: 065_temp_per_cmr_rollback.sql (screens and Worker without the label FIRST; it refuses
--   once an order is marked - that answer would be lost).
--
-- THIS FILE IS ASCII ONLY (pbcopy corrupted Greek on 27/9). ONE DO block (056/058: the SQL editor is
-- not atomic across statements; inside ONE DO block any RAISE rolls back everything), then ONE
-- read-only SELECT that prints the result row. No temp tables.
-- NO SUPERUSER NEEDED (the SQL editor's postgres is rolsuper = false): ALTER TABLE, DROP/CREATE
-- TRIGGER, CREATE OR REPLACE VIEW and CREATE OR REPLACE FUNCTION need only ownership of orders /
-- orders_with_derived / order_parent_to_legs. The PGlite harness ran this file, its dry run and its
-- rollback as a NOSUPERUSER owner as well (NOT a member of service_role), with Supabase's default
-- privileges in place (GRANT ALL to anon/authenticated/service_role on every new table and function):
-- neither CREATE OR REPLACE changes an existing ACL, proven inside the block.
--
-- Measured on the PGlite copy of production (catalog read 4/10; its pg_get_viewdef reproduces the
-- production md5s that 057 and 060 guarded on, a47e30da... and c81a268c...), after 057 + 060 + 063 as
-- executed 5-6/10: orders_with_derived md5(pg_get_viewdef(view)) with search_path "public, extensions"
-- = 4f82b738847c4770ccc379b1d558d542, 137 columns, reloptions NULL, ACL
-- {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres}; triggers 35 = B-54.
-- order_parent_to_legs as 020 left it, read on PRODUCTION 4/10 (and reproduced by the copy):
-- md5(pg_get_functiondef) = b1f552325162375855244a4161685fdc, SECURITY DEFINER, search_path=public;
-- its trigger md5(pg_get_triggerdef) with search_path "public, extensions" =
-- a0ce809945f493872557b6e1a08001a3, enabled (O).
-- After 065: orders_with_derived md5 55736818891a8f4e06193b23265cacf4, 138 columns; order_parent_to_legs
-- md5 7ffe6ccd14b19f5c2b22934520ed6c9b; its trigger md5 cb0735f6fa07cba7d340ab9f3a3ace4c.
-- The coordinator re-reads the "before" md5s on production (verify V0) before the owner's run.

DO $do$
DECLARE
  n bigint; k bigint;
  trg_before int; trg_after int; b54_before numeric; b54_baseline numeric;
  orders_before bigint; owd_rows_before bigint; view_cols int;
  old_view text; new_view text;
  view_acl text; view_owner oid; view_opts text[];
  -- The ONE change to the view text: the last select item gets a comma and the flag follows it.
  -- Both strings are the deparsed form (pg_get_viewdef), so the proof below compares like with like.
  anchor_old text := E' AS stock_lot_reference\n   FROM ';
  anchor_new text := E' AS stock_lot_reference,\n    o.temp_per_cmr\n   FROM ';
  -- The leg sync of 020 (step 3). The function gets the flag next to temperature_c in BOTH places
  -- temperature_c is copied: the SET list and the "only real changes" test of the same UPDATE. The
  -- trigger gets it right after temperature_c in its UPDATE OF list. Same strings in the rollback.
  fn_set_old text := 'temperature_c = new.temperature_c,';
  fn_set_new text := 'temperature_c = new.temperature_c, temp_per_cmr = new.temp_per_cmr,';
  fn_dif_old text := 'temperature_c is distinct from new.temperature_c or ';
  fn_dif_new text := 'temperature_c is distinct from new.temperature_c or temp_per_cmr is distinct from new.temp_per_cmr or ';
  trg_col_old text := 'temperature_c, pallet_type,';
  trg_col_new text := 'temperature_c, temp_per_cmr, pallet_type,';
  fn_oid oid; old_fn text; new_fn text; fn_attrs text;
  trg_oid oid; old_trg text; new_trg text; trg_comment text;
  r record; v numeric;
BEGIN
  -- pg_get_viewdef prints names relative to the search_path (md5 guard below): pin it.
  PERFORM set_config('search_path', 'public, extensions', true);
  -- ALTER TABLE orders and CREATE OR REPLACE VIEW take ACCESS EXCLUSIVE locks: behind an idle open
  -- transaction they would wait forever while every ORDERS read of the app queues behind them. Give
  -- up after 5 s instead - the whole block rolls back; run it again a little later (as 057/060/063).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only): the base is what 057 + 060 + 063 left on 5-6/10.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '065: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regclass('public.orders_with_derived') IS NULL
     OR (SELECT relkind FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) <> 'v' THEN
    RAISE EXCEPTION '065: public.orders_with_derived is not a plain view - stop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid IN ('public.orders'::regclass, 'public.orders_with_derived'::regclass)
                AND attname = 'temp_per_cmr' AND attnum > 0 AND NOT attisdropped) THEN
    RAISE EXCEPTION '065: already applied (orders or orders_with_derived has temp_per_cmr)';
  END IF;
  -- The view is re-created from its live text: refuse if it is not the text 057 left.
  old_view := pg_get_viewdef('public.orders_with_derived'::regclass);
  IF md5(old_view) <> '4f82b738847c4770ccc379b1d558d542' THEN
    RAISE EXCEPTION '065: orders_with_derived is not the text 057 left on 5/10 (md5 %) - someone changed the view, re-measure', md5(old_view);
  END IF;
  SELECT count(*) INTO view_cols FROM pg_attribute
   WHERE attrelid = 'public.orders_with_derived'::regclass AND attnum > 0 AND NOT attisdropped;
  IF view_cols <> 137 THEN
    RAISE EXCEPTION '065: orders_with_derived has % columns, expected 137 (057) - re-measure', view_cols;
  END IF;
  IF (length(old_view) - length(replace(old_view, anchor_old, ''))) <> length(anchor_old) THEN
    RAISE EXCEPTION '065: the end of the select list of orders_with_derived is not where it was measured';
  END IF;
  SELECT relacl::text, relowner, reloptions INTO view_acl, view_owner, view_opts
    FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass;
  IF view_opts IS NOT NULL THEN
    RAISE EXCEPTION '065: orders_with_derived has view options (%) - CREATE OR REPLACE would drop them; the owner decides',
      array_to_string(view_opts, ', ');
  END IF;
  -- B-54 counts enabled non-internal triggers in public; run_checks compares against
  -- coalesce(baseline, red_value), so a baseline would hide a change. 35 = 057 + 060 + 063 (6/10).
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value, baseline INTO b54_before, b54_baseline FROM monitoring.checks WHERE id = 'B-54';
  IF trg_before <> 35 OR b54_before IS DISTINCT FROM 35 OR b54_baseline IS NOT NULL THEN
    RAISE EXCEPTION '065: expected 35 enabled triggers in public = B-54 red_value, no baseline (057 + 060 + 063), found % triggers, B-54 red_value % baseline % - something changed triggers or B-54 since 6/10, re-measure',
      trg_before, b54_before, b54_baseline;
  END IF;
  -- The leg sync is re-created from its live text: refuse unless it is exactly what 020 left (the md5s
  -- were read on production 4/10). A hand fix since then would be silently overwritten otherwise.
  fn_oid := to_regprocedure('public.order_parent_to_legs()');
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION '065: function public.order_parent_to_legs() does not exist (020) - stop';
  END IF;
  old_fn := pg_get_functiondef(fn_oid);
  IF md5(old_fn) <> 'b1f552325162375855244a4161685fdc' THEN
    RAISE EXCEPTION '065: order_parent_to_legs is not the text 020 left (md5 %) - someone changed the leg sync, re-measure', md5(old_fn);
  END IF;
  IF (length(old_fn) - length(replace(old_fn, fn_set_old, ''))) <> length(fn_set_old)
     OR (length(old_fn) - length(replace(old_fn, fn_dif_old, ''))) <> length(fn_dif_old) THEN
    RAISE EXCEPTION '065: the temperature_c copy in order_parent_to_legs is not where it was measured';
  END IF;
  -- every attribute CREATE OR REPLACE could move: proven identical after (oid, owner, grants, SECURITY
  -- DEFINER, search_path, language, volatility, strictness, cost, return and argument types)
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO fn_attrs FROM pg_proc WHERE oid = fn_oid;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION '065: trigger order_parent_to_legs on orders is missing (020) - stop';
  END IF;
  SELECT oid, pg_get_triggerdef(oid), obj_description(oid, 'pg_trigger') INTO trg_oid, old_trg, trg_comment
    FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal;
  IF md5(old_trg) <> 'a0ce809945f493872557b6e1a08001a3'
     OR (SELECT tgenabled FROM pg_trigger WHERE oid = trg_oid) <> 'O'
     OR (SELECT tgfoid FROM pg_trigger WHERE oid = trg_oid) <> fn_oid THEN
    RAISE EXCEPTION '065: trigger order_parent_to_legs is not the one 020 left, enabled, calling order_parent_to_legs() (md5 %) - re-measure', md5(old_trg);
  END IF;
  IF (length(old_trg) - length(replace(old_trg, trg_col_old, ''))) <> length(trg_col_old) THEN
    RAISE EXCEPTION '065: temperature_c in the UPDATE OF list of trigger order_parent_to_legs is not where it was measured';
  END IF;
  SELECT count(*) INTO orders_before FROM public.orders;
  SELECT count(*) INTO owd_rows_before FROM public.orders_with_derived;

  -- 1. THE FACT, on the table (principle 4: every path - facade, SQL editor, future code - meets it).
  ALTER TABLE public.orders ADD COLUMN temp_per_cmr boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.orders.temp_per_cmr IS
    'true = the temperature of this order is the one written on the CMR; Temperature C may then be empty (owner 7/10/2026, migration 065). Facade label: Temp Per CMR.';

  -- 2. THE READ VIEW: the live text + the one line. The Worker reads every ORDERS record from here;
  --    without the column a read asking for "Temp Per CMR" would fail (PostgREST: no such column).
  EXECUTE 'CREATE OR REPLACE VIEW public.orders_with_derived AS ' || replace(old_view, anchor_old, anchor_new);

  -- 3. THE LEG SYNC (020): a parent's flag reaches its legs as its temperature_c does. The column
  --    exists by now (step 1), so the trigger can name it. pg_get_functiondef prints a complete
  --    CREATE OR REPLACE FUNCTION with the live attributes, so only the body changes. The trigger is
  --    dropped and created again in this same transaction: no other session ever sees orders without it.
  new_fn := replace(replace(old_fn, fn_set_old, fn_set_new), fn_dif_old, fn_dif_new);
  EXECUTE new_fn;
  new_trg := replace(old_trg, trg_col_old, trg_col_new);
  DROP TRIGGER order_parent_to_legs ON public.orders;
  EXECUTE new_trg;
  IF trg_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON TRIGGER order_parent_to_legs ON public.orders IS %L', trg_comment);
  END IF;

  -- 4. PROOFS inside the block: any failure rolls back everything above.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                  WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'temp_per_cmr' AND NOT a.attisdropped
                    AND a.atttypid = 'boolean'::regtype AND a.attnotnull AND pg_get_expr(d.adbin, d.adrelid) = 'false') THEN
    RAISE EXCEPTION '065 proof: orders.temp_per_cmr is not boolean NOT NULL DEFAULT false';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE temp_per_cmr) INTO k, n FROM public.orders;
  IF k <> orders_before OR n <> 0 THEN
    RAISE EXCEPTION '065 proof: orders % -> %, % marked (expected none)', orders_before, k, n;
  END IF;
  -- the view: the new text IS the old text + the one line (nothing else moved), 138 columns, the
  -- last one the boolean flag, same owner, grants and (no) options, same rows, the table's value
  new_view := pg_get_viewdef('public.orders_with_derived'::regclass);
  IF new_view IS DISTINCT FROM replace(old_view, anchor_old, anchor_new) THEN
    RAISE EXCEPTION '065 proof: orders_with_derived is not the 057 text + o.temp_per_cmr';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
       AND attnum > 0 AND NOT attisdropped) <> view_cols + 1
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
                     AND attnum = view_cols + 1 AND attname = 'temp_per_cmr' AND atttypid = 'boolean'::regtype) THEN
    RAISE EXCEPTION '065 proof: orders_with_derived does not end with temp_per_cmr (boolean) as column %', view_cols + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass
                  AND relacl::text IS NOT DISTINCT FROM view_acl AND relowner = view_owner AND reloptions IS NULL) THEN
    RAISE EXCEPTION '065 proof: orders_with_derived owner, grants or options changed';
  END IF;
  IF (SELECT count(*) FROM public.orders_with_derived) <> owd_rows_before
     OR EXISTS (SELECT 1 FROM public.orders_with_derived d JOIN public.orders o ON o.id = d.id
                 WHERE d.temp_per_cmr IS DISTINCT FROM o.temp_per_cmr) THEN
    RAISE EXCEPTION '065 proof: orders_with_derived rows changed or the flag does not read the table';
  END IF;
  -- The Worker's path (service_role through PostgREST): it reads the flag from the view and writes
  -- it on the table. A missing privilege here would be a 500 on every save after the Worker deploy.
  IF NOT has_column_privilege('service_role', 'public.orders_with_derived', 'temp_per_cmr', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.orders', 'temp_per_cmr', 'INSERT')
     OR NOT has_column_privilege('service_role', 'public.orders', 'temp_per_cmr', 'UPDATE') THEN
    RAISE EXCEPTION '065 proof: service_role (the Worker) cannot read the flag from orders_with_derived or write it on orders';
  END IF;
  -- the leg sync: the SAME function (oid) whose text is the 020 text + the two pieces, character for
  -- character, with every attribute as before (owner, grants, SECURITY DEFINER, search_path ...)
  IF to_regprocedure('public.order_parent_to_legs()') IS DISTINCT FROM fn_oid
     OR pg_get_functiondef(fn_oid) IS DISTINCT FROM new_fn THEN
    RAISE EXCEPTION '065 proof: order_parent_to_legs is not the 020 text + the temp_per_cmr copy';
  END IF;
  IF (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                       proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
        FROM pg_proc WHERE oid = fn_oid) IS DISTINCT FROM fn_attrs THEN
    RAISE EXCEPTION '065 proof: order_parent_to_legs owner, grants, SECURITY DEFINER, search_path or another attribute changed';
  END IF;
  -- ... and ONE trigger of that name: the 020 text + temp_per_cmr in its UPDATE OF list, enabled,
  -- calling the same function, the same comment
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
                     WHERE t.tgrelid = 'public.orders'::regclass AND t.tgname = 'order_parent_to_legs' AND NOT t.tgisinternal
                       AND pg_get_triggerdef(t.oid) = new_trg AND t.tgenabled = 'O' AND t.tgfoid = fn_oid
                       AND obj_description(t.oid, 'pg_trigger') IS NOT DISTINCT FROM trg_comment) THEN
    RAISE EXCEPTION '065 proof: trigger order_parent_to_legs is not the 020 trigger + temp_per_cmr in its UPDATE OF list';
  END IF;
  -- B-54: the same number of triggers (35: the leg-sync trigger was re-created under its own name, not
  -- added), and B-54 still equals it (not touched by this block)
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> 35 OR trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '065 proof: trigger count % -> % (expected 35, unchanged), or B-54 moved', trg_before, trg_after;
  END IF;
  -- B-54 runs the way run_checks (047) runs it: guard, 10 s timeout, as tms_check_runner. The text
  -- is read before the role switch (tms_check_runner cannot read schema monitoring).
  FOR r IN SELECT id, sql_text FROM monitoring.checks WHERE id = 'B-54' AND enabled LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    RESET ROLE;
    IF v IS DISTINCT FROM trg_after::numeric THEN
      RAISE EXCEPTION '065 proof: B-54 = % right after the migration (expected %)', v, trg_after;
    END IF;
  END LOOP;

  RAISE NOTICE '065 OK: orders.temp_per_cmr in place (% orders, 0 marked); orders_with_derived % -> % columns, same owner/grants/options; order_parent_to_legs copies the flag to split legs (same owner/grants/SECURITY DEFINER/search_path), its trigger watches it; triggers % -> %, B-54 = %',
    k, view_cols, view_cols + 1, trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
-- legs_copy_flag: order_parent_to_legs copies the flag and its trigger fires on it (structure only -
-- no md5 here: pg_get_triggerdef depends on the session's search_path; verify V1 checks the md5s).
WITH legs AS (
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.order_parent_to_legs()'::regprocedure AND prosecdef
                  AND position('temp_per_cmr = new.temp_per_cmr' IN prosrc) > 0
                  AND position('temp_per_cmr is distinct from new.temp_per_cmr' IN prosrc) > 0)
     AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attname = 'temp_per_cmr' AND NOT a.attisdropped
                  WHERE t.tgrelid = 'public.orders'::regclass AND t.tgname = 'order_parent_to_legs' AND t.tgenabled = 'O'
                    AND a.attnum = ANY (t.tgattr::int2[])) AS ok
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                          AND table_name = 'orders' AND column_name = 'temp_per_cmr'
                          AND data_type = 'boolean' AND is_nullable = 'NO')
             AND (SELECT attname FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
                   AND attnum = 138 AND NOT attisdropped) = 'temp_per_cmr'
             AND (SELECT ok FROM legs)
            THEN '065 OK' ELSE '065 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
         AND attnum > 0 AND NOT attisdropped) AS owd_columns,
       (SELECT count(*) FROM public.orders WHERE temp_per_cmr) AS orders_marked_cmr,
       (SELECT ok FROM legs) AS legs_copy_flag;
