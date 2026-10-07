-- 065 - TEMPERATURE "AS ON THE CMR": an international order may say that its temperature is the
--       one written on the CMR instead of a number. orders.temp_per_cmr (boolean NOT NULL DEFAULT
--       false), appended to orders_with_derived, the facade's ORDERS readView (label "Temp Per CMR").
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
-- NOT touched: national_orders (international orders only); the leg sync of 020
-- (order_parent_to_legs copies temperature_c to split legs, not this flag - a screen that prints a
-- leg reads the flag of its parent, or a later migration extends 020; owner decides); every trigger,
-- function and grant. B-54 counts enabled non-internal triggers in public and a column adds none:
-- asserted 35 before and after (057 + 060 + 063 live since 6/10), B-54 = 35, not written.
--
-- BEFORE IT: 065_temp_per_cmr_verify.sql V0 (the coordinator, SELECT only: the view md5 below, on
--   production), then 065_temp_per_cmr_dryrun.sql - this same block, generated from this file, undone.
-- EXPECTED (green, no red panel): NOTICE "065 OK: orders.temp_per_cmr in place (<n> orders, 0 marked);
--   orders_with_derived 137 -> 138 columns, same owner/grants/options; triggers 35 -> 35, B-54 = 35"
--   and ONE result row "065 OK | 35 | 35 | 138 | 0".
--   A red error = nothing changed (one DO block): stop, copy the panel to the coordinator.
-- AFTER IT: 065_temp_per_cmr_verify.sql V1 (one row, every column true).
-- Reverse: 065_temp_per_cmr_rollback.sql (screens and Worker without the label FIRST; it refuses
--   once an order is marked - that answer would be lost).
--
-- THIS FILE IS ASCII ONLY (pbcopy corrupted Greek on 27/9). ONE DO block (056/058: the SQL editor is
-- not atomic across statements; inside ONE DO block any RAISE rolls back everything), then ONE
-- read-only SELECT that prints the result row. No temp tables.
-- NO SUPERUSER NEEDED (the SQL editor's postgres is rolsuper = false): ALTER TABLE and CREATE OR
-- REPLACE VIEW need only ownership of orders / orders_with_derived. The PGlite harness ran this file,
-- its dry run and its rollback as a NOSUPERUSER owner as well.
--
-- Measured on the PGlite copy of production (catalog read 4/10; its pg_get_viewdef reproduces the
-- production md5s that 057 and 060 guarded on, a47e30da... and c81a268c...), after 057 + 060 + 063 as
-- executed 5-6/10: orders_with_derived md5(pg_get_viewdef(view)) with search_path "public, extensions"
-- = 4f82b738847c4770ccc379b1d558d542, 137 columns, reloptions NULL, ACL
-- {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres}; triggers 35 = B-54.
-- After 065: orders_with_derived md5 55736818891a8f4e06193b23265cacf4, 138 columns.
-- The coordinator re-reads the "before" md5 on production (verify V0) before the owner's run.

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
  SELECT count(*) INTO orders_before FROM public.orders;
  SELECT count(*) INTO owd_rows_before FROM public.orders_with_derived;

  -- 1. THE FACT, on the table (principle 4: every path - facade, SQL editor, future code - meets it).
  ALTER TABLE public.orders ADD COLUMN temp_per_cmr boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.orders.temp_per_cmr IS
    'true = the temperature of this order is the one written on the CMR; Temperature C may then be empty (owner 7/10/2026, migration 065). Facade label: Temp Per CMR.';

  -- 2. THE READ VIEW: the live text + the one line. The Worker reads every ORDERS record from here;
  --    without the column a read asking for "Temp Per CMR" would fail (PostgREST: no such column).
  EXECUTE 'CREATE OR REPLACE VIEW public.orders_with_derived AS ' || replace(old_view, anchor_old, anchor_new);

  -- 3. PROOFS inside the block: any failure rolls back everything above.
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
  -- B-54: the same number of triggers, and B-54 still equals it (not touched by this block)
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '065 proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
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

  RAISE NOTICE '065 OK: orders.temp_per_cmr in place (% orders, 0 marked); orders_with_derived % -> % columns, same owner/grants/options; triggers % -> %, B-54 = %',
    k, view_cols, view_cols + 1, trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                          AND table_name = 'orders' AND column_name = 'temp_per_cmr'
                          AND data_type = 'boolean' AND is_nullable = 'NO')
             AND (SELECT attname FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
                   AND attnum = 138 AND NOT attisdropped) = 'temp_per_cmr'
            THEN '065 OK' ELSE '065 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
         AND attnum > 0 AND NOT attisdropped) AS owd_columns,
       (SELECT count(*) FROM public.orders WHERE temp_per_cmr) AS orders_marked_cmr;
